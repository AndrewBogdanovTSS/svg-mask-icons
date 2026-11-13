# Playground

A Nuxt app that uses `svg-mask-icons` the way a project would, through its Nuxt module. It shows every feature on one page, and CI builds it to check the published output.

Live: https://andrewbogdanovtss.github.io/svg-mask-icons/, deployed by [`.github/workflows/pages.yml`](../.github/workflows/pages.yml) on every push to `main`. The Pages build sets `NUXT_APP_BASE_URL=/svg-mask-icons/` and the `github_pages` Nitro preset; the icon gallery exists only in dev, so the live page leaves out its links.

## Run it

The playground links to the package in the folder above (`link:..`) and loads its built `dist/`, so build the package first:

```bash
pnpm install
pnpm build
pnpm --dir playground install
pnpm --dir playground dev
```

After changing the package's source, run `pnpm build` again and restart the dev server.

`pnpm --dir playground generate` builds the static site into `playground/.output/public`, as CI does.

## What it shows

| Where | What |
|-------|------|
| `theme/app/assets/icons/` | The icons, in a theme layer the app extends: the `core` group at the top, the `account` and `checkout` groups in subfolders. |
| `nuxt.config.ts` | The module config: variants for `heart` and `bookmark`, listed exactly (`['thin', 'bold', 'solid']`). |
| `app/app.vue` | The page, one section per feature: color, size, direction, variants, groups that load on demand, and icons in real controls. Each demo shows the markup that produced it. |

- **Lazy groups.** The `account` and `checkout` sprites aren't downloaded until you click their **Show icons** button; each group's badge switches to *downloaded* when the browser fetches its sprite. Only the `core` sprite is preloaded.
- **Variants.** `heart.svg` and `bookmark.svg` set their stroke attributes on the root `<svg>`, which is what lets variants change them.
- **Icon gallery.** In dev, open `/__mask-icons/`, or the **Mask Icons** tab in Nuxt DevTools, to see every icon by group with its variants.
