<h1 align="center">svg-mask-icons</h1>

<p align="center">
  <img src="./assets/devtools-icon-outline.svg" width="120" alt="svg-mask-icons logo">
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/svg-mask-icons"><img src="https://img.shields.io/npm/v/svg-mask-icons" alt="npm version"></a>
</p>

SVG icons from sprites, drawn with CSS masks, for Vite, Vue and Nuxt.

Each icon is an empty `<i>` masked by a fragment of a stack sprite (`url(sprite.svg#name)`) and painted with `currentColor`:

- **No SVG in the DOM.** An icon is one element with an inline style, in SSR and on the client.
- **Few cached requests.** Icons come from hashed sprite assets, never inlined into the bundle: one sprite per [icon group](#icon-groups), downloaded only when one of its icons renders.
- **Colored by CSS.** The icon takes the text color, including in forced-colors mode.
- **Layer overrides.** In Nuxt, an app or brand layer replaces an icon of a layer it extends by shipping a file with the same name.

The tradeoff: a mask paints one color. Multicolor icons need another approach.

## Install

```bash
pnpm add svg-mask-icons
```

## Nuxt

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['svg-mask-icons/nuxt'],
})
```

Put icons in `assets/icons/` (inside `srcDir`, so `app/assets/icons/` in Nuxt 4) of the app or any layer, then:

```vue
<mask-icon name="arrow" dir="down" />
```

Icon groups and names are typed from the sprites after `nuxi prepare`.

| Option          | Default                          | Description                                                  |
|-----------------|----------------------------------|--------------------------------------------------------------|
| `dir`           | `'assets/icons'`                 | Icon folder inside each layer's `srcDir`.                    |
| `groups`        | `{ core: { preload: true } }`    | Settings per [icon group](#icon-groups).                     |
| `variants`, `defaultVariant`, `icons` | -          | [Variants](#variants) and the icons that get them.           |
| `cacheDir`      | `'node_modules/.cache/mask-icons'` | Where built sprites are kept, relative to `rootDir`.       |
| `svgo`          | `{ plugins: ['preset-default'] }` | [SVGO](https://svgo.dev) options for each icon (see [Optimization](#optimization)). `false` turns SVGO off. |
| `componentName` | `'MaskIcon'`                     | Global component name, used as `<mask-icon>` in templates. `false` registers none. |
| `gallery`       | `true`                           | Icon gallery in dev (see [Icon gallery](#icon-gallery)). `false` turns it off. |

Other modules can read each group's icons with the `mask-icons:ready` hook.

## Vite + Vue

```ts
// vite.config.ts
import vue from '@vitejs/plugin-vue'
import maskIcons from 'svg-mask-icons/vite'

export default {
  plugins: [vue(), maskIcons({ dirs: 'src/assets/icons' })],
}
```

```ts
// main.ts
import { createMaskIcons } from 'svg-mask-icons/vue'
import { preload, sprites, variants } from 'virtual:mask-icons'

createApp(App).use(createMaskIcons({ sprites, preload, variants })).mount('#app')
```

```vue
<script setup lang="ts">
import { MaskIcon } from 'svg-mask-icons/vue'
</script>

<template>
  <mask-icon name="close" :size="24" />
</template>
```

`createMaskIcons` adds the `<link rel="preload">` of preloaded groups to the document head when the app starts in the browser.

The plugin writes `mask-icons.d.ts` to the project root with the types for `virtual:mask-icons` and the icon groups and names. Include it in `tsconfig.json`.

| Option     | Default                            | Description                                                         |
|------------|------------------------------------|---------------------------------------------------------------------|
| `dirs`     | `'src/assets/icons'`               | Icon folders in priority order. An earlier folder overrides a later one. |
| `groups`   | `{ core: { preload: true } }`      | Settings per [icon group](#icon-groups).                            |
| `variants`, `defaultVariant`, `icons` | -           | [Variants](#variants) and the icons that get them.                  |
| `cacheDir` | `'node_modules/.cache/mask-icons'` | Where built sprites are kept.                                       |
| `svgo`     | `{ plugins: ['preset-default'] }`  | SVGO options for each icon. `false` turns SVGO off.                 |
| `dts`      | `'mask-icons.d.ts'`                | Declarations file. `false` skips it.                                |
| `gallery`  | `{}`                               | Icon gallery in dev. `root` is what source paths are shown relative to, the Vite root by default. `false` turns it off. |

## Icon groups

Icons at the top of the icon folder form the `core` group. Each subfolder is a group of its own, built into a sprite of its own:

```
assets/icons/
├── arrow.svg          core
├── close.svg          core
└── checkout/
    ├── cart.svg       checkout
    └── card.svg       checkout
```

Pick the group with the `group` prop. It defaults to `core`, and names only need to be unique within a group:

```vue
<mask-icon name="arrow" />
<mask-icon group="checkout" name="cart" />
```

The browser downloads a group's sprite when the first of its icons renders, so a page without checkout icons never loads the checkout sprite. That first icon appears once the sprite arrives. For icons visible on first paint, preload their group:

```ts
maskIcons: {
  groups: {
    core: { preload: true }, // the default
    checkout: { preload: true },
  },
}
```

A preloaded group's sprite gets a `<link rel="preload" as="image" crossorigin="anonymous">`: in the server-rendered head with Nuxt, and from `createMaskIcons` with Vite. The `crossorigin` matches the CORS mode the browser fetches mask images in, so the preload is reused instead of downloaded twice.

Overrides work per group: a layer's `checkout/cart.svg` replaces the `checkout/cart.svg` of a layer it extends.

## Variants

A mask paints one color, and page CSS can't reach inside the sprite, so an icon's shapes can't be restyled at runtime. Variants build the looks you need into the sprite instead: thinner or bolder strokes, outline or solid fill, and any other presentation attribute that passes from an element to its children (`stroke-linecap`, `stroke-dasharray`, `fill-rule`, `fill-opacity`, ...).

Define the axes once, then choose which icons get them, per group or per icon:

```ts
maskIcons: {
  variants: {
    weight: { regular: { 'stroke-width': 1.5 }, thin: { 'stroke-width': 1 }, bold: { 'stroke-width': 2 } },
    style: { outline: { fill: 'none' }, solid: { fill: '#000' } },
  },
  // The look without `variant`. The first value of each axis by default.
  defaultVariant: { weight: 'regular', style: 'outline' },
  groups: {
    core: { variants: ['weight'] }, // every core icon gets every weight
  },
  icons: {
    'checkout/cart': { variants: ['bold', 'solid'] }, // only cart gets these two
    'arrow': { variants: { weight: ['bold'] } }, // replaces the group's: regular and bold only
  },
}
```

```vue
<mask-icon name="arrow" />                        <!-- default: regular -->
<mask-icon name="arrow" variant="bold" />
<mask-icon group="checkout" name="cart" variant="solid" />
```

A selection takes one of three forms:

| Selection                                | Builds                                            |
|------------------------------------------|---------------------------------------------------|
| `['weight', 'style']` (axes)             | every combination of their values: `thin`, `bold`, `solid`, `thin solid`, `bold solid` |
| `{ weight: ['bold'], style: ['solid'] }` | every combination of those values: `bold`, `solid`, `bold solid` |
| `['thin', 'bold', 'solid']` (variants)   | exactly these; combine values with a space, as in `'bold solid'` |

- **Cheap.** An icon's shapes are stored once, in a `<symbol>`. Each variant is a small `<svg>` with the attributes it changes and a `<use>` of the shapes, about 100 bytes. Only the selected variants are built. List variants when combinations add nothing: a filled shape covers its outline, so `bold solid` looks like `solid`.
- **Root attributes are the controls.** The attributes on an icon's root `<svg>` that a selected axis sets move from the shapes to the variants, since an attribute on the shapes would win over one passed down. Draw icons with these attributes on the root `<svg>`. An attribute on a single shape stays, so a dot that must stay filled in the outline style keeps its own `fill`.
- **Defaults apply.** An icon with variants gets the default values too: with the config above, every core icon is drawn at `stroke-width` 1.5 unless `variant` says otherwise.
- **`variant` names values, not axes.** Value names are unique across axes, so `variant="bold solid"` sets both. An axis left out keeps its default.
- **Falls back safely.** A variant that was not built for an icon draws the icon's default and warns in dev. `icons` keys that match no icon warn at build time.
- **Fill needs closed shapes.** `fill` on an open path, such as an arrow, fills a wedge, and a filled shape covers the shapes inside it. Check fill variants in the [gallery](#icon-gallery), which previews every variant.

## Icon gallery

In dev, `/__mask-icons/` lists every icon by group: a preview drawn the way the component draws it, its name and its source file, so you can see which layer an icon comes from. Filter by name, and click an icon to copy its name.

In Nuxt, the gallery is also a **Mask Icons** tab in Nuxt DevTools, marked with the mask icon served at `/__mask-icons/icon.svg`. Reopen the tab after changing an icon to see the rebuilt sprite.

## `<mask-icon>` props

| Prop     | Type                                 | Default    | Description                                   |
|----------|--------------------------------------|------------|-----------------------------------------------|
| `name`   | icon name                            | -          | Icon in the group's sprite.                   |
| `group`  | icon group                           | `'core'`   | [Icon group](#icon-groups) whose sprite holds the icon. |
| `src`    | `string`                             | -          | Any image URL to mask with instead.           |
| `size`   | `string \| number`                   | `'1em'`    | Width and height. A number is in pixels.      |
| `width`  | `string \| number`                   | -          | Overrides `size`.                             |
| `height` | `string \| number`                   | -          | Overrides `size`.                             |
| `dir`    | `'right' \| 'left' \| 'up' \| 'down'` | -          | Rotates an icon drawn pointing right.         |
| `pos`    | `string`                             | `'center'` | `mask-position` inside the box.               |
| `variant`| variant values                       | -          | [Variant](#variants) values, separated by spaces: `'bold'`, `'bold solid'`. |

Icons are decorative (`aria-hidden="true"`). Give the button or link that contains one an accessible name.

## Optimization

Each icon goes through [SVGO](https://svgo.dev) 4 with its default preset, the same optimization [SVGOMG](https://jakearchibald.github.io/svgomg/) applies by default, then into the sprite as an `<svg id="name" viewBox>`:

- **Only what a sprite needs.** XML declarations, comments, `width`, `height` and `xmlns` are dropped. An icon without a `viewBox` gets one from its `width` and `height`.
- **No clashing ids.** Ids inside an icon, such as a gradient's or a clip path's, get the icon name as a prefix (`flag__a`), even with SVGO turned off.

`svgo` is shallow-merged over the default, so `plugins` replaces the plugin list:

```ts
maskIcons: {
  svgo: {
    multipass: true,
    plugins: [{ name: 'preset-default', params: { overrides: { convertColors: false } } }],
  },
}
```

A lower `floatPrecision` makes a smaller sprite but moves the points of detailed icons: on hand-optimized icons, precision 2 visibly changed some shapes. Check the [gallery](#icon-gallery) after lowering it.

## Caching

Each group's sprite is stored as `<cacheDir>/<hash>.svg`, where the hash covers the icon file paths, the SVGO options and the variant settings. Functions in the SVGO options, such as a custom plugin's code, are not part of the hash: delete the cache after changing one. A build reuses it unless an icon file is newer. Switching between icon sets, such as Nuxt layer stacks, restores a sprite built before instead of compiling it again.

## License

MIT
