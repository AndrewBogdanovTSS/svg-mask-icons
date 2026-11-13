/**
 * Presentation attributes a variant value sets on an icon, such as
 * `{ 'stroke-width': 2 }` or `{ fill: 'none' }`.
 */
export type VariantAttrs = Record<string, string | number>

/**
 * Variant axes by name, each a set of named values. Value names are unique
 * across axes, so `variant="bold solid"` names one value of each axis.
 */
export type VariantAxes = Record<string, Record<string, VariantAttrs>>

/**
 * Which variants to build. The default look is always there.
 *
 * - Axis names, `['weight', 'style']`: every combination of their values.
 * - Values per axis, `{ weight: ['bold'], style: ['solid'] }`: every
 *   combination of those values.
 * - Variants, `['thin', 'bold', 'solid']`: exactly these, each a value or
 *   values of different axes separated by a space, as in `'bold solid'`.
 */
export type VariantSelection = string[] | Record<string, string[]>

/** The variants to build for one icon. */
export interface VariantPlan {
  /** Axes the variants change, in axis order. Their attributes move off the icon's shapes. */
  axes: string[]
  /** Each variant as a fragment suffix: `bold`, `bold~solid`. */
  suffixes: string[]
}

/** Separates an icon name from its variant values in a sprite fragment, as in `cart~bold~solid`. */
export const VARIANT_SEPARATOR = '~'

/**
 * What the app needs to address variants: the value names of each axis, the
 * default of each, and the variants built for each icon, by group.
 */
export interface VariantManifest {
  axes: Record<string, string[]>
  defaults: Record<string, string>
  icons: Record<string, Record<string, string[]>>
}

/**
 * Checks the axes and fills in each axis's default, its first value unless
 * `defaultVariant` names another. Throws on a value name used by two axes or
 * on a default that is not a value of its axis.
 */
export const resolveDefaults = (axes: VariantAxes, defaultVariant: Record<string, string> = {}) => {
  const seen = new Map<string, string>()
  for (const [axis, values] of Object.entries(axes)) {
    for (const value of Object.keys(values)) {
      if (seen.has(value)) throw new Error(`[mask-icons] Variant value "${value}" is in both "${seen.get(value)}" and "${axis}". Value names must be unique across axes.`)
      seen.set(value, axis)
    }
  }
  for (const axis of Object.keys(defaultVariant)) {
    if (!axes[axis]) throw new Error(`[mask-icons] \`defaultVariant\` names "${axis}", which is no variant axis.`)
    if (!(defaultVariant[axis] in axes[axis])) throw new Error(`[mask-icons] \`defaultVariant.${axis}\` is "${defaultVariant[axis]}", which is no value of that axis.`)
  }

  return Object.fromEntries(Object.entries(axes).map(([axis, values]) => [axis, defaultVariant[axis] ?? Object.keys(values)[0]]))
}

/**
 * Builds the suffix of one variant from its values: the non-default values in
 * axis order. Throws on an unknown value or two values of one axis.
 */
const exactSuffix = (variant: string, axes: VariantAxes, defaults: Record<string, string>, where: string) => {
  const axisNames = Object.keys(axes)
  const chosen: Record<string, string> = {}
  for (const value of variant.trim().split(/\s+/)) {
    const axis = axisNames.find((name) => value in axes[name])
    if (!axis) throw new Error(`[mask-icons] ${where} names "${value}", which is no variant axis or value.`)
    if (chosen[axis]) throw new Error(`[mask-icons] ${where} names "${variant}", which has two values of the variant axis "${axis}".`)
    chosen[axis] = value
  }
  return { axes: Object.keys(chosen), suffix: axisNames.map((axis) => chosen[axis]).filter((value, i) => value && value !== defaults[axisNames[i]]).join(VARIANT_SEPARATOR) }
}

/**
 * Turns a selection into the variants to build for one icon, leaving out the
 * default look. Throws on an axis or value the axes do not define, and on a
 * list that mixes axis names with variants.
 */
export const selectVariants = (selection: VariantSelection, axes: VariantAxes, defaults: Record<string, string>, where: string): VariantPlan => {
  const axisNames = Object.keys(axes)

  if (Array.isArray(selection) && !selection.some((item) => item in axes)) {
    const exact = selection.map((variant) => exactSuffix(variant, axes, defaults, where))
    const used = new Set(exact.flatMap(({ axes }) => axes))
    return { axes: axisNames.filter((axis) => used.has(axis)), suffixes: [...new Set(exact.map(({ suffix }) => suffix).filter(Boolean))] }
  }

  const mixed = Array.isArray(selection) && selection.find((item) => !(item in axes))
  if (mixed) throw new Error(`[mask-icons] ${where} mixes axis names with the variant "${mixed}". List either axes or variants.`)

  const entries = Array.isArray(selection) ? selection.map((axis) => [axis, Object.keys(axes[axis])] as const) : Object.entries(selection)
  const selected = Object.fromEntries(entries.map(([axis, values]) => {
    if (!axes[axis]) throw new Error(`[mask-icons] ${where} names the variant axis "${axis}", which \`variants\` does not define.`)
    const unknown = values.find((value) => !(value in axes[axis]))
    if (unknown) throw new Error(`[mask-icons] ${where} names "${unknown}", which is no value of the variant axis "${axis}".`)
    return [axis, values.filter((value) => value !== defaults[axis])]
  }))
  return { axes: axisNames.filter((axis) => axis in selected), suffixes: variantSuffixes(selected, axes) }
}

/**
 * Lists the variants to build for one icon, each as the non-default values of
 * one combination joined in axis order: `bold`, `solid`, `bold~solid`.
 */
export const variantSuffixes = (selected: Record<string, string[]>, axes: VariantAxes) => {
  let combos: string[][] = [[]]
  for (const axis of Object.keys(axes)) {
    if (!selected[axis]?.length) continue
    combos = combos.flatMap((combo) => [combo, ...selected[axis].map((value) => [...combo, value])])
  }

  return combos.filter((combo) => combo.length).map((combo) => combo.join(VARIANT_SEPARATOR))
}

/**
 * Resolves `<mask-icon variant>` to the sprite fragment of the icon. Falls
 * back to the default icon, with a warning, when the variant was not built.
 */
export const variantFragment = (manifest: VariantManifest | null | undefined, group: string, name: string, variant?: string): { id: string, warning?: string } => {
  const values = variant?.trim().split(/\s+/).filter(Boolean) ?? []
  if (!values.length) return { id: name }
  if (!manifest) return { id: name, warning: `No variants are configured, so variant="${variant}" is ignored.` }

  const axisNames = Object.keys(manifest.axes)
  const chosen: Record<string, string> = {}
  for (const value of values) {
    const axis = axisNames.find((name) => manifest.axes[name].includes(value))
    if (!axis) return { id: name, warning: `Unknown variant "${value}".` }
    chosen[axis] = value
  }

  const suffix = axisNames.map((axis) => chosen[axis]).filter((value, i) => value && value !== manifest.defaults[axisNames[i]]).join(VARIANT_SEPARATOR)
  if (!suffix) return { id: name }
  if (!manifest.icons[group]?.[name]?.includes(suffix)) {
    return { id: name, warning: `Icon "${name}" of group "${group}" has no variant "${variant}". Showing its default.` }
  }
  return { id: `${name}${VARIANT_SEPARATOR}${suffix}` }
}
