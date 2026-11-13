import type { VariantAxes, VariantManifest, VariantPlan, VariantSelection } from './variants'
import type { Config as SvgoConfig } from 'svgo'
import { DOMImplementation, DOMParser, XMLSerializer } from '@xmldom/xmldom'
import { createHash, randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { basename, extname, join, resolve } from 'node:path'
import { optimize } from 'svgo'
import { DEFAULT_GROUP } from './types'
import { resolveDefaults, selectVariants, VARIANT_SEPARATOR } from './variants'

/**
 * SVGO options for each icon, shallow-merged over {@link defaultSvgoOptions}:
 * `plugins` replaces the default plugin list. `false` turns SVGO off.
 */
export type SvgoOptions = Omit<SvgoConfig, 'path' | 'datauri'> | false

/** Variants to build into one sprite. */
export interface SpriteVariants {
  /** Variant axes, each a set of named values with the attributes they set. */
  axes: VariantAxes
  /** Default value of each axis, the look of an icon without `variant`. */
  defaults: Record<string, string>
  /** Variants of every icon in the sprite. */
  all?: VariantSelection
  /** Variants of single icons, by icon name. Replaces `all` for that icon. */
  icons?: Record<string, VariantSelection>
}

export interface BuildSpriteOptions {
  /**
   * Icon folders in priority order. When two folders hold an icon with the
   * same file name, the earlier folder wins - list overrides first.
   */
  dirs: string[]
  /** Folder that keeps built sprites, one file per hash of their inputs. */
  cacheDir: string
  /** SVGO options for each icon. */
  svgo?: SvgoOptions
  /** Variants to build, as `<svg>` wrappers that reuse each icon's shapes. */
  variants?: SpriteVariants
}

export interface SpriteResult {
  /** Icon names in sprite order, each usable as a `#name` fragment. */
  icons: string[]
  /** Source file of each icon, by name: the file that won over any overrides. */
  sources: Record<string, string>
  /**
   * Variants built for each icon that has any, as fragment suffixes:
   * `bold~solid` is the fragment `#cart~bold~solid`.
   */
  variants: Record<string, string[]>
  /** Absolute path of the built sprite. */
  file: string
  /** `true` when the sprite was reused instead of compiled. */
  cached: boolean
}

interface IconEntry {
  name: string
  file: string
}

/**
 * SVGO's default preset, at its default precision of 3 decimal places. Lower
 * precision makes a smaller sprite but moves the shapes of detailed icons.
 */
export const defaultSvgoOptions: Exclude<SvgoOptions, false> = {
  plugins: ['preset-default'],
}

const getMtime = (file: string) => fs.stat(file).then(({ mtimeMs }) => mtimeMs, () => 0)

const readIcons = async (dir: string): Promise<IconEntry[]> =>
  (await fs.readdir(dir).catch(() => [] as string[]))
    .filter((file) => extname(file) === '.svg')
    .sort()
    .map((file) => ({ name: basename(file, '.svg'), file: join(dir, file) }))

/**
 * Lists the icons across `dirs`, keeping the first icon of each name.
 */
export const collectIcons = async (dirs: string[]): Promise<IconEntry[]> => {
  const seen = new Set<string>()

  return (await Promise.all(dirs.map((dir) => readIcons(resolve(dir))))).flat().filter(({ name }) => {
    if (seen.has(name)) return false
    seen.add(name)
    return true
  })
}

const writeAtomic = async (file: string, contents: string | Buffer) => {
  const temporaryPath = `${file}.${randomUUID()}.tmp`
  try {
    await fs.writeFile(temporaryPath, contents)
    await fs.rename(temporaryPath, file)
  }
  catch (err) {
    await fs.rm(temporaryPath, { force: true }).catch(() => {})
    throw new Error(`[mask-icons] Failed to write sprite ${file}`, { cause: err })
  }
}

const SVG_NS = 'http://www.w3.org/2000/svg'

/** Shows only the icon a fragment targets, which makes the sprite a stack sprite. */
const STACK_STYLE = ':root>svg{display:none}:root>svg:target{display:block}'

/** Root attributes that only matter to an icon as a standalone file. */
const STANDALONE_ATTRS = new Set(['width', 'height', 'x', 'y', 'id', 'version', 'baseProfile', 'xml:space', 'enable-background'])

const parser = new DOMParser({
  errorHandler: {
    warning: () => {},
    error: (message: string) => { throw new Error(message) },
    fatalError: (message: string) => { throw new Error(message) },
  },
})

/**
 * Optimizes one icon with SVGO. Its ids get the icon name as a prefix, also
 * with SVGO turned off, so the gradients or clip paths of two icons can't
 * clash in the shared sprite.
 */
const optimizeIcon = async ({ name, file }: IconEntry, svgo: SvgoOptions) => {
  const config = svgo === false ? {} : { ...defaultSvgoOptions, ...svgo }
  try {
    return optimize(await fs.readFile(file, 'utf8'), {
      ...config,
      path: file,
      plugins: [...(config.plugins ?? []), { name: 'prefixIds', params: { prefix: name, delim: '__' } }],
    }).data
  }
  catch (err) {
    throw new Error(`[mask-icons] Failed to optimize ${file}`, { cause: err })
  }
}

/** The icon's viewBox, or one made from its `width` and `height`. */
const viewBoxOf = (icon: Element, file: string) => {
  const viewBox = icon.getAttribute('viewBox')
  if (viewBox) return viewBox

  const [width, height] = ['width', 'height'].map((attr) => icon.getAttribute(attr) ?? '')
  if (!width.includes('%') && !height.includes('%') && Number.parseFloat(width) > 0 && Number.parseFloat(height) > 0) {
    return `0 0 ${Number.parseFloat(width)} ${Number.parseFloat(height)}`
  }
  throw new Error(`[mask-icons] ${file} has no viewBox, and no width and height to make one from.`)
}

/**
 * Builds the stack sprite: a `<style>` that shows only the targeted icon, and
 * each icon as an `<svg id="name" viewBox>` holding its optimized content.
 */
const compile = async (entries: IconEntry[], svgo: SvgoOptions, plans: Record<string, VariantPlan>, variants?: SpriteVariants) => {
  if (!entries.length) return `<svg xmlns="${SVG_NS}"/>`

  const doc = new DOMImplementation().createDocument(SVG_NS, 'svg', null)
  const root = doc.documentElement!
  const style = doc.createElementNS(SVG_NS, 'style')
  style.appendChild(doc.createTextNode(STACK_STYLE))
  root.appendChild(style)

  const optimized = await Promise.all(entries.map((entry) => optimizeIcon(entry, svgo)))
  entries.forEach(({ name, file }, i) => {
    const icon = parser.parseFromString(optimized[i], 'image/svg+xml').documentElement!
    const svg = doc.createElementNS(SVG_NS, 'svg')
    svg.setAttribute('viewBox', viewBoxOf(icon, file))
    for (const { name: attr, value } of Array.from(icon.attributes)) {
      if (attr === 'viewBox' || attr === 'xmlns' || attr.startsWith('xmlns:') || STANDALONE_ATTRS.has(attr)) continue
      svg.setAttribute(attr, value)
    }
    svg.setAttribute('id', name)
    for (const child of Array.from(icon.childNodes)) svg.appendChild(doc.importNode(child, true))
    root.appendChild(svg)
  })

  if (Object.keys(plans).length) addVariants(doc, plans, variants!)
  return new XMLSerializer().serializeToString(doc)
}

/** Id of the `<symbol>` holding the shapes of an icon with variants. */
const shapeId = (name: string) => `${name}${VARIANT_SEPARATOR}${VARIANT_SEPARATOR}shape`

/**
 * Rewrites each icon with variants into one `<symbol>` of its shapes and one
 * `<svg>` per variant that draws them with `<use>`. Shapes inherit
 * presentation attributes through `<use>`, so a variant only sets the
 * attributes its values change.
 *
 * Root attributes the selected axes control move from the shapes to the
 * wrappers, since an attribute on the shapes would win over an inherited one.
 * Attributes on single shapes stay, as deliberate exceptions.
 */
function addVariants(doc: Document, plans: Record<string, VariantPlan>, { axes, defaults }: SpriteVariants) {
  const root = doc.documentElement!
  const defs = doc.createElementNS(SVG_NS, 'defs')
  root.insertBefore(defs, root.getElementsByTagName('style')[0]?.nextSibling ?? root.firstChild)

  for (const node of Array.from(root.childNodes)) {
    const icon = node as Element
    const name = icon.nodeType === 1 && icon.tagName === 'svg' ? icon.getAttribute('id') : null
    const plan = name && plans[name]
    if (!name || !plan) continue

    const controlled = new Set(plan.axes.flatMap((axis) => Object.values(axes[axis]).flatMap((attrs) => Object.keys(attrs))))
    const authored: Record<string, string> = {}
    const symbol = doc.createElementNS(SVG_NS, 'symbol')
    for (const { name: attr, value } of Array.from(icon.attributes)) {
      if (controlled.has(attr)) authored[attr] = value
      else if (attr !== 'id') symbol.setAttribute(attr, value)
    }
    symbol.setAttribute('id', shapeId(name))
    while (icon.firstChild) symbol.appendChild(icon.firstChild)
    defs.appendChild(symbol)

    const wrapper = (suffix: string) => {
      const values = suffix ? suffix.split(VARIANT_SEPARATOR) : []
      const svg = doc.createElementNS(SVG_NS, 'svg')
      const viewBox = icon.getAttribute('viewBox')
      if (viewBox) svg.setAttribute('viewBox', viewBox)
      svg.setAttribute('id', suffix ? `${name}${VARIANT_SEPARATOR}${suffix}` : name)
      const attrs = plan.axes.map((axis) => axes[axis][values.find((value) => value in axes[axis]) ?? defaults[axis]])
      for (const [attr, value] of Object.entries(Object.assign({ ...authored }, ...attrs))) svg.setAttribute(attr, String(value))
      const use = doc.createElementNS(SVG_NS, 'use')
      use.setAttribute('href', `#${shapeId(name)}`)
      svg.appendChild(use)
      return svg
    }

    let anchor = wrapper('')
    root.replaceChild(anchor, icon)
    for (const suffix of plan.suffixes) {
      const next = wrapper(suffix)
      root.insertBefore(next, anchor.nextSibling)
      anchor = next
    }
  }
}

/** Resolves the variant selection of each icon, for the icons that have one. */
const planVariants = (icons: string[], variants?: SpriteVariants) => {
  const plans: Record<string, VariantPlan> = {}
  if (!variants) return plans

  for (const name of icons) {
    const selection = variants.icons?.[name] ?? variants.all
    if (selection) plans[name] = selectVariants(selection, variants.axes, variants.defaults, `The variants of icon "${name}"`)
  }
  return plans
}

/**
 * Builds a stack sprite from the icons in `dirs`, or reuses the one built from
 * the same icon files and options when no icon changed since.
 *
 * Each build is kept under the hash of its inputs, so switching between icon
 * sets (Nuxt layer stacks, for example) restores a sprite built before instead
 * of compiling it again.
 */
export const buildSprite = async ({ dirs, cacheDir, svgo = {}, variants }: BuildSpriteOptions): Promise<SpriteResult> => {
  const entries = await collectIcons(dirs)
  const icons = entries.map(({ name }) => name)
  const plans = planVariants(icons, variants)
  const suffixes = Object.fromEntries(Object.entries(plans)
    .map(([name, plan]) => [name, plan.suffixes] as const)
    .filter(([, list]) => list.length))
  const taken = Object.entries(suffixes).flatMap(([name, list]) => list.map((suffix) => `${name}${VARIANT_SEPARATOR}${suffix}`)).find((id) => icons.includes(id))
  if (taken) throw new Error(`[mask-icons] The variant "${taken}" has the name of an icon. Rename the icon.`)

  const hash = createHash('sha256')
    .update(JSON.stringify({ files: entries.map(({ file }) => file), svgo, variants: Object.keys(plans).length ? { plans, axes: variants!.axes, defaults: variants!.defaults } : undefined }))
    .digest('hex')
    .slice(0, 16)
  const file = join(resolve(cacheDir), `${hash}.svg`)
  const [builtAt, ...iconMtimes] = await Promise.all([getMtime(file), ...entries.map(({ file }) => getMtime(file))])
  const cached = builtAt > Math.max(0, ...iconMtimes)

  if (!cached) {
    const contents = await compile(entries, svgo, plans, variants)

    await fs.mkdir(resolve(cacheDir), { recursive: true })
    await writeAtomic(file, contents)
  }

  return { icons, sources: Object.fromEntries(entries.map(({ name, file }) => [name, file])), variants: suffixes, file, cached }
}

/** One sprite per icon group, by group name, `core` first. */
export type SpriteGroups = Record<string, SpriteResult>

const readSubfolders = async (dir: string) =>
  (await fs.readdir(dir, { withFileTypes: true }).catch(() => []))
    .filter((entry) => entry.isDirectory())
    .map(({ name }) => name)

export interface BuildSpritesOptions extends Omit<BuildSpriteOptions, 'variants'> {
  /** Variant axes, each a set of named values with the attributes they set. */
  variants?: VariantAxes
  /** Default value of each axis. The first value of an axis by default. */
  defaultVariant?: Record<string, string>
  /** Variants for every icon of a group, by group name. */
  groups?: Record<string, { variants?: VariantSelection }>
  /**
   * Variants for single icons, by path in the icon folder: `arrow` for a
   * `core` icon, `checkout/cart` for one in a group. Replaces the group's.
   */
  icons?: Record<string, { variants?: VariantSelection }>
  /** Reports a config problem that does not stop the build. */
  warn?: (message: string) => void
}

const iconKey = (group: string, name: string) => group === DEFAULT_GROUP ? name : `${group}/${name}`

/**
 * Builds one sprite per icon group, so icons a page does not show stay out of
 * the sprite it downloads. The icons at the top of each folder form the `core`
 * group, and each subfolder is a group named after it: `checkout/cart.svg` is
 * the icon `cart` of the group `checkout`.
 *
 * Overrides work per group: an earlier folder's `checkout/cart.svg` replaces a
 * later folder's. A `core/` subfolder adds to the `core` group.
 */
export const buildSprites = async (options: BuildSpritesOptions): Promise<SpriteGroups> => {
  const { dirs, variants: axes, defaultVariant, groups: groupOptions = {}, icons: iconOptions = {}, warn = console.warn, ...spriteOptions } = options
  const defaults = axes ? resolveDefaults(axes, defaultVariant) : {}

  const iconSelections: Record<string, Record<string, VariantSelection>> = {}
  for (const [key, { variants: selection }] of Object.entries(iconOptions)) {
    if (!selection) continue
    const slash = key.indexOf('/')
    const [group, name] = slash < 0 ? [DEFAULT_GROUP, key] : [key.slice(0, slash), key.slice(slash + 1)]
    ;(iconSelections[group] ??= {})[name] = selection
  }
  if (!axes && (Object.keys(iconSelections).length || Object.values(groupOptions).some(({ variants }) => variants))) {
    throw new Error('[mask-icons] Icons or groups select variants, but `variants` defines no axes.')
  }

  const roots = dirs.map((dir) => resolve(dir))
  const found = new Set((await Promise.all(roots.map(readSubfolders))).flat())
  found.delete(DEFAULT_GROUP)
  const groups = [DEFAULT_GROUP, ...[...found].sort()]
  const results = await Promise.all(groups.map((group) => {
    const all = groupOptions[group]?.variants
    const icons = iconSelections[group]
    return buildSprite({
      ...spriteOptions,
      dirs: roots.flatMap((dir) => group === DEFAULT_GROUP ? [dir, join(dir, DEFAULT_GROUP)] : [join(dir, group)]),
      variants: axes && (all || icons) ? { axes, defaults, all, icons } : undefined,
    })
  }))
  const built: SpriteGroups = Object.fromEntries(groups.map((group, i) => [group, results[i]]))

  for (const [group, icons] of Object.entries(iconSelections)) {
    for (const name of Object.keys(icons)) {
      if (!built[group]?.icons.includes(name)) warn(`[mask-icons] \`icons\` sets variants for "${iconKey(group, name)}", which is no icon.`)
    }
  }

  return built
}

/**
 * What the app needs to address the variants of the built sprites, or `null`
 * without variants.
 */
export const variantManifest = (groups: SpriteGroups, axes?: VariantAxes, defaultVariant?: Record<string, string>): VariantManifest | null => {
  if (!axes) return null

  return {
    axes: Object.fromEntries(Object.entries(axes).map(([axis, values]) => [axis, Object.keys(values)])),
    defaults: resolveDefaults(axes, defaultVariant),
    icons: Object.fromEntries(Object.entries(groups).filter(([, { variants }]) => Object.keys(variants).length).map(([group, { variants }]) => [group, variants])),
  }
}
