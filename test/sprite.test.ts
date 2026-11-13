import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildSprite, buildSprites, collectIcons } from '../src/core/sprite'
import { copyFixture, fixtures, tmpDir } from './helpers'

const base = join(fixtures, 'base')
const override = join(fixtures, 'override')

const touch = (file: string) => {
  const later = new Date(Date.now() + 60_000)
  return fs.utimes(file, later, later)
}

describe('collectIcons', () => {
  it('keeps the first icon of each name and ignores non-svg files', async () => {
    const icons = await collectIcons([override, base])

    expect(icons.map(({ name }) => name)).toEqual(['close', 'arrow'])
    expect(icons[0].file).toBe(join(override, 'close.svg'))
  })

  it('treats a missing folder as empty', async () => {
    expect(await collectIcons([join(fixtures, 'missing')])).toEqual([])
  })
})

describe('buildSprite', () => {
  it('builds a stack sprite addressable by icon name', async () => {
    const cacheDir = await tmpDir('build')
    const result = await buildSprite({ dirs: [base], cacheDir })
    const sprite = await fs.readFile(result.file, 'utf8')

    expect(result).toMatchObject({ icons: ['arrow', 'close'], cached: false })
    expect(sprite).toContain('id="arrow"')
    expect(sprite).toContain('id="close"')
    expect(sprite).toContain(':target')
    expect(sprite).not.toContain('<?xml')
  })

  it('lets an earlier folder override an icon', async () => {
    const cacheDir = await tmpDir('override')
    const { file, sources } = await buildSprite({ dirs: [override, base], cacheDir })

    expect(await fs.readFile(file, 'utf8')).toContain('<circle')
    expect(sources).toEqual({ close: join(override, 'close.svg'), arrow: join(base, 'arrow.svg') })
  })

  it('reuses the sprite built from the same icons and options', async () => {
    const cacheDir = await tmpDir('reuse')
    const first = await buildSprite({ dirs: [base], cacheDir })
    const second = await buildSprite({ dirs: [base], cacheDir })

    expect(second).toEqual({ ...first, cached: true })
  })

  it('keeps one sprite per icon set, so switching back reuses it', async () => {
    const cacheDir = await tmpDir('switch')
    const baseOnly = await buildSprite({ dirs: [base], cacheDir })
    const overridden = await buildSprite({ dirs: [override, base], cacheDir })
    const again = await buildSprite({ dirs: [base], cacheDir })

    expect(overridden.file).not.toBe(baseOnly.file)
    expect(again).toEqual({ ...baseOnly, cached: true })
  })

  it('rebuilds when an icon changes', async () => {
    const cacheDir = await tmpDir('change')
    const icons = await copyFixture('base', join(cacheDir, 'icons'))
    await buildSprite({ dirs: [icons], cacheDir })

    await fs.writeFile(join(icons, 'arrow.svg'), '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><path d="M0 0h4v4H0z"/></svg>')
    await touch(join(icons, 'arrow.svg'))
    const result = await buildSprite({ dirs: [icons], cacheDir })

    expect(result.cached).toBe(false)
    expect(await fs.readFile(result.file, 'utf8')).toContain('viewBox="0 0 32 32"')
  })

  it('rebuilds when the SVGO options change', async () => {
    const cacheDir = await tmpDir('options')
    const first = await buildSprite({ dirs: [base], cacheDir })
    const second = await buildSprite({ dirs: [base], cacheDir, svgo: false })

    expect(second.cached).toBe(false)
    expect(second.file).not.toBe(first.file)
    // Without SVGO, the arrow keeps its stroke color as written.
    expect(await fs.readFile(second.file, 'utf8')).toContain('stroke="#000"')
  })

  it('optimizes each icon and keeps only what the sprite needs on its root', async () => {
    const cacheDir = await tmpDir('optimize')
    const icons = join(cacheDir, 'icons')
    await fs.mkdir(icons)
    await fs.writeFile(join(icons, 'raw.svg'), '<?xml version="1.0" encoding="utf-8"?><!-- Exported --><svg width="800px" height="800px" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M20.0000 8.5000V13.5000" stroke="#000000" stroke-width="1.5"/></svg>')
    const sprite = await fs.readFile((await buildSprite({ dirs: [icons], cacheDir })).file, 'utf8')

    expect(sprite).toBe('<svg xmlns="http://www.w3.org/2000/svg"><style>:root&gt;svg{display:none}:root&gt;svg:target{display:block}</style>'
      + '<svg viewBox="0 0 24 24" fill="none" id="raw"><path stroke="#000" stroke-width="1.5" d="M20 8.5v5"/></svg></svg>')
  })

  it('makes a viewBox from width and height when an icon has none', async () => {
    const cacheDir = await tmpDir('viewbox')
    const icons = join(cacheDir, 'icons')
    await fs.mkdir(icons)
    await fs.writeFile(join(icons, 'edit.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18"><path d="M1 1h16v16H1z"/></svg>')

    expect(await fs.readFile((await buildSprite({ dirs: [icons], cacheDir })).file, 'utf8')).toContain('<svg viewBox="0 0 18 18" id="edit">')

    await fs.writeFile(join(icons, 'broken.svg'), '<svg xmlns="http://www.w3.org/2000/svg"><path d="M1 1h16v16H1z"/></svg>')
    await expect(buildSprite({ dirs: [icons], cacheDir })).rejects.toThrow('broken.svg has no viewBox, and no width and height')
  })

  it('prefixes the ids of each icon, so two icons with the same ids can\'t clash', async () => {
    const cacheDir = await tmpDir('ids')
    const icons = join(cacheDir, 'icons')
    await fs.mkdir(icons)
    const clipped = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><clipPath id="clip"><path d="M0 0h8v16H0z"/></clipPath><circle cx="8" cy="8" r="8" clip-path="url(#clip)"/></svg>'
    await fs.writeFile(join(icons, 'left.svg'), clipped)
    await fs.writeFile(join(icons, 'right.svg'), clipped.replace('M0 0h8', 'M8 0h8'))
    const sprite = await fs.readFile((await buildSprite({ dirs: [icons], cacheDir, svgo: false })).file, 'utf8')

    expect(sprite).toContain('id="left__clip"')
    expect(sprite).toContain('url(#left__clip)')
    expect(sprite).toContain('id="right__clip"')
    expect(sprite).toContain('url(#right__clip)')
  })

  it('writes an empty sprite when there are no icons', async () => {
    const cacheDir = await tmpDir('empty')
    const result = await buildSprite({ dirs: [join(fixtures, 'missing')], cacheDir })

    expect(result.icons).toEqual([])
    expect(await fs.readFile(result.file, 'utf8')).toBe('<svg xmlns="http://www.w3.org/2000/svg"/>')
  })
})

describe('buildSprites', () => {
  it('builds a `core` sprite from the top of each folder and one sprite per subfolder', async () => {
    const cacheDir = await tmpDir('groups')
    const groups = await buildSprites({ dirs: [override, base], cacheDir })

    expect(Object.keys(groups)).toEqual(['core', 'lazy'])
    expect(groups.core.icons).toEqual(['close', 'arrow'])
    expect(groups.lazy.icons).toEqual(['cart', 'box'])
    expect(groups.lazy.file).not.toBe(groups.core.file)
    expect(await fs.readFile(groups.lazy.file, 'utf8')).not.toContain('id="arrow"')
  })

  it('lets an earlier folder override an icon within a group', async () => {
    const cacheDir = await tmpDir('groups-override')
    const { lazy } = await buildSprites({ dirs: [override, base], cacheDir })

    expect(lazy.sources.cart).toBe(join(override, 'lazy', 'cart.svg'))
    expect(await fs.readFile(lazy.file, 'utf8')).toContain('<circle')
  })

  it('adds a `core/` subfolder to the `core` group', async () => {
    const cacheDir = await tmpDir('groups-core')
    const icons = await copyFixture('base', join(cacheDir, 'icons'))
    await fs.mkdir(join(icons, 'core'))
    await fs.writeFile(join(icons, 'core', 'star.svg'), '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M8 1l2 5h5l-4 3 2 6-5-4-5 4 2-6-4-3h5z"/></svg>')
    const groups = await buildSprites({ dirs: [icons], cacheDir })

    expect(Object.keys(groups)).toEqual(['core', 'lazy'])
    expect(groups.core.icons).toEqual(['arrow', 'close', 'star'])
  })

  it('always has a `core` group, empty without top-level icons', async () => {
    const cacheDir = await tmpDir('groups-empty')
    const groups = await buildSprites({ dirs: [join(fixtures, 'missing')], cacheDir })

    expect(Object.keys(groups)).toEqual(['core'])
    expect(groups.core.icons).toEqual([])
  })
})
