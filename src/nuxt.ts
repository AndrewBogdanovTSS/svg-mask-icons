import type { SpriteGroups, SpriteResult, SvgoOptions } from './core/sprite'
import type { MaskIconGroupOptions, MaskIconOptions, MaskIconVariantOptions } from './vite'
import type { HookResult } from '@nuxt/schema'
import { join, resolve, sep } from 'node:path'
import { addComponent, addPluginTemplate, addTypeTemplate, addVitePlugin, defineNuxtModule, useLogger } from '@nuxt/kit'
import { GALLERY_ICON, GALLERY_ROUTE } from './core/gallery'
import { buildSprites } from './core/sprite'
import { renderTypes, VIRTUAL_ID } from './core/types'
import maskIcons from './vite'

export interface MaskIconsNuxtOptions extends MaskIconVariantOptions {
  /**
   * Icon folder inside each layer's `srcDir`. When layers ship an icon with the
   * same name and group, the layer with the higher priority wins, so a brand
   * or app layer overrides the icons of the layers it extends. Icons at the
   * top of the folder form the `core` group; each subfolder is a group with a
   * sprite of its own.
   * @default 'assets/icons'
   */
  dir?: string
  /**
   * Settings per icon group, by group name. `preload` adds a
   * `<link rel="preload">` for the group's sprite to the server-rendered head.
   * @default { core: { preload: true } }
   */
  groups?: Record<string, MaskIconGroupOptions>
  /**
   * Folder that keeps built sprites, relative to `rootDir`.
   * @default 'node_modules/.cache/mask-icons'
   */
  cacheDir?: string
  /**
   * SVGO options for each icon, shallow-merged over the default preset:
   * `plugins` replaces the default plugin list. `false` turns SVGO off.
   */
  svgo?: SvgoOptions
  /**
   * Global component name, used as `<mask-icon>` in templates. `false`
   * registers no component.
   * @default 'MaskIcon'
   */
  componentName?: string | false
  /**
   * Dev-only page listing every icon, at `/__mask-icons/` and as a "Mask Icons"
   * tab in Nuxt DevTools. Clicking an icon copies its name. `false` turns it
   * off.
   * @default true
   */
  gallery?: boolean
}

/** The part of a Nuxt DevTools custom tab this module sets. */
interface DevtoolsTab {
  name: string
  title: string
  icon: string
  view: { type: 'iframe', src: string }
}

/**
 * `devtools:customTabs` is declared by `@nuxt/devtools-kit`. Typed locally so
 * the module needs no dependency on it: DevTools calls the hook when present,
 * and nothing calls it otherwise.
 */
type CustomTabsHook = (name: 'devtools:customTabs', callback: (tabs: DevtoolsTab[]) => void) => void

declare module '@nuxt/schema' {
  interface NuxtHooks {
    /** Called with each group's sprite and icon names once they are built or reused. */
    'mask-icons:ready': (groups: SpriteGroups) => HookResult
  }
}

const renderPlugin = () => `import { defineNuxtPlugin, useHead } from '#imports'
import { createMaskIcons, preloadLink } from 'mask-icons/vue'
import { preload, sprites, variants } from '${VIRTUAL_ID}'

export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.vueApp.use(createMaskIcons({ sprites, variants }))
  useHead({ link: preload.map((group) => preloadLink(sprites[group])) })
})
`

/**
 * Builds one sprite from the icons of every Nuxt layer, provides it to the app
 * and registers `<mask-icon>`.
 */
export default defineNuxtModule<MaskIconsNuxtOptions>({
  meta: {
    name: 'mask-icons',
    configKey: 'maskIcons',
    compatibility: {
      nuxt: '>=3.17.0',
    },
  },
  defaults: {
    dir: 'assets/icons',
    cacheDir: 'node_modules/.cache/mask-icons',
    componentName: 'MaskIcon',
  },
  async setup(options, nuxt) {
    // `_layers` is ordered from the highest priority layer to the lowest.
    const dirs = nuxt.options._layers.map((layer) => join(layer.config.srcDir, options.dir!))
    const cacheDir = join(nuxt.options.rootDir, options.cacheDir!)

    // Built here, not only in the Vite plugin, so `nuxi prepare` writes the icon
    // types and other modules can read the icon list during setup. The plugin's
    // own build then reuses the same sprite from the cache.
    const variantOptions = { variants: options.variants, defaultVariant: options.defaultVariant, icons: options.icons }
    const result = await buildSprites({
      dirs,
      cacheDir,
      svgo: options.svgo,
      groups: options.groups,
      ...variantOptions,
      warn: (message) => useLogger('mask-icons').warn(message),
    })
    let groups = result
    const variantValues = Object.values(options.variants ?? {}).flatMap((values) => Object.keys(values))

    addTypeTemplate({
      filename: 'types/mask-icons.d.ts',
      getContents: () => renderTypes(groups, variantValues),
    })

    addVitePlugin(maskIcons({
      dirs,
      groups: options.groups,
      ...variantOptions,
      cacheDir,
      svgo: options.svgo,
      dts: false,
      gallery: options.gallery !== false && { root: nuxt.options.rootDir },
      onBuild: (next) => {
        groups = next
      },
    }))

    // Nuxt prefetches every asset the app entry imports, which would download
    // the sprite of every group on every page. A sprite loads when one of its
    // icons renders, or early through its group's `preload`.
    nuxt.hook('build:manifest', (manifest) => {
      for (const entry of Object.values(manifest)) {
        if (!entry.src || !resolve(nuxt.options.srcDir, entry.src).startsWith(cacheDir + sep)) continue
        for (const sprite of [entry, manifest[entry.file]]) {
          if (!sprite) continue
          sprite.prefetch = false
          sprite.preload = false
        }
      }
    })

    addPluginTemplate({
      filename: 'mask-icons.mjs',
      getContents: renderPlugin,
    })

    if (options.componentName) {
      addComponent({
        name: options.componentName,
        export: 'MaskIcon',
        filePath: 'mask-icons/vue',
      })
    }

    if (nuxt.options.dev && options.gallery !== false) {
      ;(nuxt.hook as unknown as CustomTabsHook)('devtools:customTabs', (tabs) => {
        tabs.push({
          name: 'mask-icons',
          title: 'Mask Icons',
          icon: GALLERY_ICON,
          view: { type: 'iframe', src: `${GALLERY_ROUTE}/` },
        })
      })
    }

    await nuxt.callHook('mask-icons:ready', result)
  },
})

export type { MaskIconGroupOptions, MaskIconOptions, MaskIconVariantOptions, SpriteGroups, SpriteResult, SvgoOptions }
