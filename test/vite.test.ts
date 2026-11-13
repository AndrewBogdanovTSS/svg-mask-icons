import type { Rollup } from 'vite'
import type { MaskIconsOptions } from '../src/vite'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { build } from 'vite'
import { describe, expect, it } from 'vitest'
import maskIcons from '../src/vite'
import { fixtures, tmpDir } from './helpers'

const buildApp = async (root: string, options: MaskIconsOptions = {}) => {
  await fs.writeFile(join(root, 'main.js'), 'export { icons, preload, sprites, variants } from \'virtual:mask-icons\'\n')

  const output = await build({
    root,
    logLevel: 'silent',
    configFile: false,
    plugins: [maskIcons({ dirs: [join(fixtures, 'override'), join(fixtures, 'base')], ...options })],
    build: {
      write: false,
      minify: false,
      rollupOptions: { input: join(root, 'main.js'), preserveEntrySignatures: 'exports-only' },
    },
  }) as Rollup.RollupOutput | Rollup.RollupOutput[]

  const files = [output].flat()[0].output
  const entry = files.find((file) => file.type === 'chunk' && file.isEntry) as Rollup.OutputChunk
  const sprites = files.filter((file): file is Rollup.OutputAsset => file.type === 'asset' && file.fileName.endsWith('.svg'))

  return { entry, sprites }
}

describe('maskIcons (vite)', () => {
  it('emits one hashed sprite per group and exports their URLs and icon names', async () => {
    const root = await tmpDir('vite')
    const { entry, sprites } = await buildApp(root)
    const core = sprites.find(({ source }) => String(source).includes('id="arrow"'))!
    const lazy = sprites.find(({ source }) => String(source).includes('id="cart"'))!

    expect(sprites).toHaveLength(2)
    expect(String(lazy.source)).not.toContain('id="arrow"')
    expect(entry.code).toContain(`/${core.fileName}`)
    expect(entry.code).toContain(`/${lazy.fileName}`)
    expect(entry.code).not.toContain('data:image/svg+xml')
    expect(entry.code).toMatch(/\[(["`])close\1,\s*(["`])arrow\2\]/)
    expect(entry.code).toMatch(/\[(["`])cart\1,\s*(["`])box\2\]/)
  })

  it('preloads `core` by default and any group set to preload', async () => {
    const root = await tmpDir('vite-preload')

    expect((await buildApp(root)).entry.code).toMatch(/preload\s*=\s*\[(["`])core\1\]/)
    expect((await buildApp(root, { groups: { core: { preload: false }, lazy: { preload: true } } })).entry.code)
      .toMatch(/preload\s*=\s*\[(["`])lazy\1\]/)
  })

  it('builds the configured variants and exports which exist', async () => {
    const root = await tmpDir('vite-variants')
    const { entry, sprites } = await buildApp(root, {
      variants: { weight: { regular: { 'stroke-width': 1.5 }, bold: { 'stroke-width': 2 } } },
      icons: { 'lazy/cart': { variants: ['weight'] } },
    })

    const { variants } = await import(`data:text/javascript,${encodeURIComponent(entry.code)}`)

    expect(sprites.some(({ source }) => String(source).includes('id="cart~bold"'))).toBe(true)
    expect(variants).toEqual({ axes: { weight: ['regular', 'bold'] }, defaults: { weight: 'regular' }, icons: { lazy: { cart: ['bold'] } } })
    expect(await fs.readFile(join(root, 'mask-icons.d.ts'), 'utf8')).toContain('"bold": true')
  })

  it('exports `variants` as null without variant axes', async () => {
    const root = await tmpDir('vite-no-variants')

    expect((await buildApp(root)).entry.code).toMatch(/variants\s*=\s*null/)
  })

  it('writes the virtual module and icon name declarations per group', async () => {
    const root = await tmpDir('vite-dts')
    await buildApp(root)
    const dts = await fs.readFile(join(root, 'mask-icons.d.ts'), 'utf8')

    expect(dts).toContain('declare module \'virtual:mask-icons\'')
    expect(dts).toContain('"core": "close" | "arrow"')
    expect(dts).toContain('"lazy": "cart" | "box"')
  })
})
