import type { SpriteGroups, SpriteResult, SvgoOptions } from './core/sprite'
import type { VariantAttrs, VariantAxes, VariantSelection } from './core/variants'
import type { Plugin, ViteDevServer } from 'vite'
import { promises as fs } from 'node:fs'
import { extname, resolve, sep } from 'node:path'
import { GALLERY_ROUTE, renderGallery } from './core/gallery'
import { buildSprites, variantManifest } from './core/sprite'
import { DEFAULT_GROUP, renderTypes, VIRTUAL_ID } from './core/types'

/** Settings of one icon group. */
export interface MaskIconGroupOptions {
  /**
   * Preloads the group's sprite with `<link rel="preload">`, so its icons
   * show on first render instead of after the sprite downloads. Without it,
   * the browser fetches the sprite when the first of its icons renders.
   * @default true for `core`, false for other groups
   */
  preload?: boolean
  /**
   * Variants to build for every icon of the group: axis names, for all their
   * values, or the values per axis.
   */
  variants?: VariantSelection
}

/** Settings of one icon. */
export interface MaskIconOptions {
  /** Variants to build for the icon. Replaces its group's `variants`. */
  variants?: VariantSelection
}

/** Variant options, shared by the Vite plugin and the Nuxt module. */
export interface MaskIconVariantOptions {
  /**
   * Variant axes by name, each a set of named values with the presentation
   * attributes they set on an icon's root, such as
   * `{ weight: { thin: { 'stroke-width': 1 }, bold: { 'stroke-width': 2 } } }`.
   * Value names are unique across axes. Groups and icons choose which to build.
   */
  variants?: VariantAxes
  /**
   * Value of each axis an icon has without `variant`. The first value of an
   * axis by default.
   */
  defaultVariant?: Record<string, string>
  /**
   * Settings per icon, by path in the icon folder: `arrow` for a `core` icon,
   * `checkout/cart` for one in a group.
   */
  icons?: Record<string, MaskIconOptions>
}

export interface MaskIconsOptions extends MaskIconVariantOptions {
  /**
   * Icon folders, relative to the Vite root, in priority order: an icon in an
   * earlier folder overrides one with the same name in a later folder. Icons
   * at the top of a folder form the `core` group; each subfolder is a group
   * with a sprite of its own.
   * @default 'src/assets/icons'
   */
  dirs?: string | string[]
  /** Settings per icon group, by group name. */
  groups?: Record<string, MaskIconGroupOptions>
  /**
   * Folder that keeps built sprites, relative to the Vite root.
   * @default 'node_modules/.cache/mask-icons'
   */
  cacheDir?: string
  /**
   * SVGO options for each icon, shallow-merged over the default preset:
   * `plugins` replaces the default plugin list. `false` turns SVGO off.
   */
  svgo?: SvgoOptions
  /**
   * Where to write the type declarations for `virtual:mask-icons` and the icon
   * names, relative to the Vite root. `false` skips them.
   * @default 'mask-icons.d.ts'
   */
  dts?: string | false
  /**
   * Dev server page listing every icon, at `/__mask-icons/`. Clicking an icon
   * copies its name. Source files are shown relative to `root`, the Vite root
   * by default. `false` turns it off.
   */
  gallery?: false | { root?: string }
  /** Called after every sprite build, cached or not. */
  onBuild?: (groups: SpriteGroups) => void | Promise<void>
}

const RESOLVED_ID = `\0${VIRTUAL_ID}`

const toPosix = (path: string) => path.replaceAll('\\', '/')

// The gallery's icon, shown on the Nuxt DevTools tab. Resolved from this
// module, so it works from `src/` and from the flat `dist/` alike.
const iconFile = new URL('../assets/devtools-icon-outline.svg', import.meta.url)

const writeIfChanged = async (file: string, contents: string) => {
  if (await fs.readFile(file, 'utf8').catch(() => '') === contents) return
  await fs.writeFile(file, contents)
}

const invalidate = (server: ViteDevServer) => {
  const graphs = [...Object.values(server.environments ?? {}).map(({ moduleGraph }) => moduleGraph), server.moduleGraph]

  for (const graph of graphs) {
    const module = graph?.getModuleById(RESOLVED_ID)
    if (module) graph.invalidateModule(module as never)
  }
  server.ws.send({ type: 'full-reload' })
}

/**
 * Builds one sprite per icon group and serves them as `virtual:mask-icons`:
 *
 * ```ts
 * import { icons, preload, sprites } from 'virtual:mask-icons'
 * ```
 *
 * `sprites` maps each group to its sprite's URL - emitted as a hashed asset in
 * production, never inlined, so its `#name` fragments resolve. `preload` lists
 * the groups to preload, and `icons` the icon names of each group.
 */
export default function maskIcons(options: MaskIconsOptions = {}): Plugin {
  let root = ''
  let dirs: string[] = []
  let cacheDir = ''
  let dts: string | false = false
  let current: Promise<SpriteGroups> | undefined

  const preloads = (group: string) => options.groups?.[group]?.preload ?? group === DEFAULT_GROUP

  let warn = (message: string) => console.warn(message)
  const variantValues = Object.values(options.variants ?? {}).flatMap((values) => Object.keys(values))

  const build = () => {
    current = buildSprites({
      dirs,
      cacheDir,
      svgo: options.svgo,
      variants: options.variants,
      defaultVariant: options.defaultVariant,
      groups: options.groups,
      icons: options.icons,
      warn,
    }).then(async (groups) => {
      if (dts) await writeIfChanged(dts, renderTypes(groups, variantValues))
      await options.onBuild?.(groups)
      return groups
    })
    return current
  }

  return {
    name: 'mask-icons',
    enforce: 'pre',

    configResolved(config) {
      warn = (message) => config.logger.warn(message)
      root = config.root
      dirs = [options.dirs ?? 'src/assets/icons'].flat().map((dir) => resolve(config.root, dir))
      cacheDir = resolve(config.root, options.cacheDir ?? 'node_modules/.cache/mask-icons')
      dts = options.dts === false ? false : resolve(config.root, options.dts ?? 'mask-icons.d.ts')
    },

    async buildStart() {
      await build()
    },

    resolveId(id) {
      if (id === VIRTUAL_ID) return RESOLVED_ID
    },

    async load(id) {
      if (id !== RESOLVED_ID) return
      const groups = await (current ?? build())
      const entries = Object.entries(groups)

      return [
        ...entries.map(([, { file }], i) => `import sprite${i} from ${JSON.stringify(`${toPosix(file)}?url&no-inline`)}`),
        `export const sprites = { ${entries.map(([group], i) => `${JSON.stringify(group)}: sprite${i}`).join(', ')} }`,
        `export const preload = ${JSON.stringify(entries.map(([group]) => group).filter(preloads))}`,
        `export const icons = ${JSON.stringify(Object.fromEntries(entries.map(([group, { icons }]) => [group, icons])))}`,
        `export const variants = ${JSON.stringify(variantManifest(groups, options.variants, options.defaultVariant))}`,
      ].join('\n')
    },

    configureServer(server) {
      server.watcher.add(dirs)

      const onChange = async (file: string) => {
        if (extname(file) !== '.svg' || !dirs.some((dir) => resolve(file).startsWith(dir + sep))) return
        await build()
        invalidate(server)
      }

      server.watcher.on('add', onChange)
      server.watcher.on('change', onChange)
      server.watcher.on('unlink', onChange)

      if (options.gallery === false) return
      const sourceRoot = options.gallery?.root ?? root

      // Mounted on a path, so Nuxt's dev server forwards these requests to Vite.
      server.middlewares.use(GALLERY_ROUTE, async (req, res, next) => {
        try {
          const path = decodeURIComponent((req.url ?? '/').split('?')[0])
          if (path === '/icon.svg') {
            res.setHeader('Content-Type', 'image/svg+xml')
            res.end(await fs.readFile(iconFile))
            return
          }

          const sprite = path.match(/^\/sprite\/(.+)\.svg$/)?.[1]
          if (path !== '/' && !sprite) return next()

          const groups = await (current ?? build())
          if (sprite && !groups[sprite]) return next()

          res.setHeader('Cache-Control', 'no-cache')
          if (sprite) {
            res.setHeader('Content-Type', 'image/svg+xml')
            res.end(await fs.readFile(groups[sprite].file))
          }
          else {
            res.setHeader('Content-Type', 'text/html; charset=utf-8')
            res.end(renderGallery(groups, sourceRoot, Object.keys(groups).filter(preloads)))
          }
        }
        catch (err) {
          next(err)
        }
      })
    },
  }
}

export type { SpriteGroups, SpriteResult, SvgoOptions, VariantAttrs, VariantAxes, VariantSelection }
