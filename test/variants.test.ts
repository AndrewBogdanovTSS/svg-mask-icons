import type { VariantAxes, VariantManifest } from '../src/core/variants'
import { DOMParser } from '@xmldom/xmldom'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { buildSprites, variantManifest } from '../src/core/sprite'
import { resolveDefaults, selectVariants, variantFragment, variantSuffixes } from '../src/core/variants'
import { fixtures, tmpDir } from './helpers'

const dirs = [join(fixtures, 'variants')]

const axes: VariantAxes = {
  weight: { regular: { 'stroke-width': 1.5 }, thin: { 'stroke-width': 1 }, bold: { 'stroke-width': 2 } },
  style: { outline: { fill: 'none' }, solid: { fill: '#000' } },
}
const defaults = { weight: 'regular', style: 'outline' }

/** Reads the top-level `<svg>` elements and `<symbol>`s of a sprite, by id. */
const readSprite = async (file: string) => {
  const doc = new DOMParser().parseFromString(await fs.readFile(file, 'utf8'), 'image/svg+xml')
  const byId = (tag: string) => Object.fromEntries(Array.from(doc.getElementsByTagName(tag)).map((element) => [element.getAttribute('id'), element]))
  const attrs = (element?: Element) => element && Object.fromEntries(Array.from(element.attributes).map(({ name, value }) => [name, value]))
  return { svgs: byId('svg'), symbols: byId('symbol'), attrs }
}

describe('variant config', () => {
  it('defaults each axis to its first value unless `defaultVariant` names another', () => {
    expect(resolveDefaults(axes)).toEqual(defaults)
    expect(resolveDefaults(axes, { weight: 'bold' })).toEqual({ weight: 'bold', style: 'outline' })
  })

  it.each([
    ['a value in two axes', { a: { x: {} }, b: { x: {} } }, {}, 'Value names must be unique across axes'],
    ['an unknown default axis', axes, { size: 'sm' }, '"size", which is no variant axis'],
    ['an unknown default value', axes, { weight: 'heavy' }, '"heavy", which is no value'],
  ])('rejects %s', (_, given, defaultVariant, message) => {
    expect(() => resolveDefaults(given as VariantAxes, defaultVariant)).toThrow(message)
  })

  it('builds every combination of named axes, or of the listed values, without the defaults', () => {
    expect(selectVariants(['weight'], axes, defaults, 'test')).toEqual({ axes: ['weight'], suffixes: ['thin', 'bold'] })
    expect(selectVariants(['style', 'weight'], axes, defaults, 'test'))
      .toEqual({ axes: ['weight', 'style'], suffixes: ['solid', 'thin', 'thin~solid', 'bold', 'bold~solid'] })
    expect(selectVariants({ style: ['solid', 'outline'] }, axes, defaults, 'test')).toEqual({ axes: ['style'], suffixes: ['solid'] })
    expect(() => selectVariants({ size: ['sm'] }, axes, defaults, 'test')).toThrow('"size", which `variants` does not define')
    expect(() => selectVariants({ weight: ['heavy'] }, axes, defaults, 'test')).toThrow('"heavy", which is no value')
  })

  it('builds exactly the listed variants', () => {
    expect(selectVariants(['thin', 'bold', 'solid'], axes, defaults, 'test')).toEqual({ axes: ['weight', 'style'], suffixes: ['thin', 'bold', 'solid'] })
    expect(selectVariants(['solid bold', 'regular', 'bold solid'], axes, defaults, 'test')).toEqual({ axes: ['weight', 'style'], suffixes: ['bold~solid'] })
    expect(selectVariants(['solid'], axes, defaults, 'test')).toEqual({ axes: ['style'], suffixes: ['solid'] })
  })

  it.each([
    ['an unknown name', ['size'], '"size", which is no variant axis or value'],
    ['two values of one axis', ['thin bold'], '"thin bold", which has two values of the variant axis "weight"'],
    ['axes mixed with variants', ['weight', 'solid'], 'mixes axis names with the variant "solid"'],
  ])('rejects a list with %s', (_, selection, message) => {
    expect(() => selectVariants(selection, axes, defaults, 'test')).toThrow(message)
  })

  it('lists every combination of the selected values in axis order', () => {
    expect(variantSuffixes({ style: ['solid'], weight: ['thin', 'bold'] }, axes))
      .toEqual(['solid', 'thin', 'thin~solid', 'bold', 'bold~solid'])
  })
})

describe('variantFragment', () => {
  const manifest: VariantManifest = {
    axes: { weight: ['regular', 'thin', 'bold'], style: ['outline', 'solid'] },
    defaults,
    icons: { core: { ring: ['bold', 'bold~solid'] } },
  }

  it.each([
    ['no variant', undefined, 'ring'],
    ['default values', 'regular outline', 'ring'],
    ['a built variant', 'bold', 'ring~bold'],
    ['values in any order', 'solid bold', 'ring~bold~solid'],
  ])('resolves %s', (_, variant, id) => {
    expect(variantFragment(manifest, 'core', 'ring', variant)).toEqual({ id })
  })

  it.each([
    ['a variant not built for the icon', 'thin', 'has no variant "thin"'],
    ['an unknown value', 'heavy', 'Unknown variant "heavy"'],
  ])('falls back to the default icon with a warning for %s', (_, variant, warning) => {
    const result = variantFragment(manifest, 'core', 'ring', variant)

    expect(result.id).toBe('ring')
    expect(result.warning).toContain(warning)
  })

  it('warns that variants are ignored without a manifest', () => {
    expect(variantFragment(null, 'core', 'ring', 'bold').warning).toContain('No variants are configured')
  })
})

describe('buildSprites with variants', () => {
  it('moves the controlled root attributes of an icon from its shapes to one wrapper per variant', async () => {
    const cacheDir = await tmpDir('variants')
    const groups = await buildSprites({ dirs, cacheDir, variants: axes, icons: { ring: { variants: ['weight', 'style'] } } })
    const { svgs, symbols, attrs } = await readSprite(groups.core.file)

    expect(groups.core.variants).toEqual({ ring: ['solid', 'thin', 'thin~solid', 'bold', 'bold~solid'] })
    // Uncontrolled attributes stay with the shapes; controlled ones leave them.
    expect(attrs(symbols['ring~~shape'])).toMatchObject({ 'stroke': '#000', 'stroke-linecap': 'round' })
    expect(attrs(symbols['ring~~shape'])).not.toHaveProperty('stroke-width')
    expect(attrs(symbols['ring~~shape'])).not.toHaveProperty('fill')
    // The icon without `variant` gets the default values.
    expect(attrs(svgs.ring)).toMatchObject({ 'stroke-width': '1.5', 'fill': 'none' })
    expect(attrs(svgs['ring~bold'])).toMatchObject({ 'stroke-width': '2', 'fill': 'none' })
    expect(attrs(svgs['ring~thin~solid'])).toMatchObject({ 'stroke-width': '1', 'fill': '#000' })
    expect(svgs['ring~bold'].getElementsByTagName('use')[0].getAttribute('href')).toBe('#ring~~shape')
    // Icons without variants stay as they are.
    expect(svgs.dot.getElementsByTagName('circle')).toHaveLength(1)
  })

  it('builds a group\'s variants for all its icons, and lets an icon replace them', async () => {
    const cacheDir = await tmpDir('variants-groups')
    const groups = await buildSprites({
      dirs,
      cacheDir,
      variants: axes,
      groups: { core: { variants: ['weight'] } },
      icons: { 'ring': { variants: { weight: ['bold'] } }, 'shop/cart': { variants: { style: ['solid'] } } },
    })

    expect(groups.core.variants).toEqual({ dot: ['thin', 'bold'], ring: ['bold'] })
    expect(groups.shop.variants).toEqual({ cart: ['solid'] })
    expect(variantManifest(groups, axes)).toEqual({
      axes: { weight: ['regular', 'thin', 'bold'], style: ['outline', 'solid'] },
      defaults,
      icons: { core: { dot: ['thin', 'bold'], ring: ['bold'] }, shop: { cart: ['solid'] } },
    })
  })

  it('builds only the listed variants of an icon, with the attributes of the axes they change', async () => {
    const cacheDir = await tmpDir('variants-exact')
    const groups = await buildSprites({ dirs, cacheDir, variants: axes, icons: { ring: { variants: ['bold', 'solid'] } } })
    const { svgs, attrs } = await readSprite(groups.core.file)

    expect(groups.core.variants).toEqual({ ring: ['bold', 'solid'] })
    expect(svgs['ring~bold~solid']).toBeUndefined()
    expect(attrs(svgs['ring~bold'])).toMatchObject({ 'stroke-width': '2', 'fill': 'none' })
    expect(attrs(svgs['ring~solid'])).toMatchObject({ 'stroke-width': '1.5', 'fill': '#000' })
  })

  it('warns about icon settings that match no icon', async () => {
    const cacheDir = await tmpDir('variants-unknown')
    const warn = vi.fn()
    await buildSprites({ dirs, cacheDir, variants: axes, icons: { 'shop/carts': { variants: ['weight'] } }, warn })

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('"shop/carts", which is no icon'))
  })

  it('rebuilds the sprite when the variant config changes', async () => {
    const cacheDir = await tmpDir('variants-cache')
    const first = await buildSprites({ dirs, cacheDir, variants: axes, icons: { ring: { variants: ['weight'] } } })
    const second = await buildSprites({ dirs, cacheDir, variants: axes, icons: { ring: { variants: ['style'] } } })
    const plain = await buildSprites({ dirs, cacheDir })

    expect(second.core.file).not.toBe(first.core.file)
    expect(plain.core.variants).toEqual({})
    expect(await fs.readFile(plain.core.file, 'utf8')).not.toContain('<use')
  })

  it('needs axes when groups or icons select variants', async () => {
    const cacheDir = await tmpDir('variants-no-axes')

    await expect(buildSprites({ dirs, cacheDir, icons: { ring: { variants: ['weight'] } } })).rejects.toThrow('`variants` defines no axes')
  })
})
