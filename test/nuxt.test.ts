import { addComponent, addPluginTemplate, addTypeTemplate, addVitePlugin } from '@nuxt/kit'
import { readFile } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fixtures, tmpDir } from './helpers'

vi.mock('@nuxt/kit', () => ({
  addComponent: vi.fn(),
  addPluginTemplate: vi.fn(),
  addTypeTemplate: vi.fn(),
  addVitePlugin: vi.fn(),
  defineNuxtModule: vi.fn((definition) => definition),
  useLogger: vi.fn(() => ({ warn: vi.fn() })),
}))

vi.mock('../src/vite', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/vite')>()
  return { default: vi.fn(actual.default) }
})

const { default: module } = await import('../src/nuxt')
const { default: maskIcons } = await import('../src/vite')

type Definition = {
  defaults: Record<string, unknown>
  setup: (options: Record<string, unknown>, nuxt: unknown) => Promise<void>
}

const definition = module as unknown as Definition

const setup = async (options: Record<string, unknown> = {}, dev = false) => {
  const rootDir = await tmpDir('nuxt')
  const nuxt = {
    callHook: vi.fn(),
    hook: vi.fn(),
    options: {
      dev,
      rootDir,
      srcDir: join(rootDir, 'app'),
      // Highest priority first, as Nuxt orders `_layers`.
      // The icon folder is the layer's srcDir itself (`dir: ''`).
      _layers: [{ config: { srcDir: join(fixtures, 'override') } }, { config: { srcDir: join(fixtures, 'base') } }],
    },
  }

  await definition.setup({ ...definition.defaults, dir: '', ...options }, nuxt)

  return nuxt
}

describe('maskIcons (nuxt)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('builds one sprite per group across layers, letting a higher priority layer override an icon', async () => {
    const nuxt = await setup()
    const [hook, groups] = nuxt.callHook.mock.calls[0]

    expect(hook).toBe('mask-icons:ready')
    expect(groups.core.icons).toEqual(['close', 'arrow'])
    expect(groups.lazy.icons).toEqual(['cart', 'box'])
    expect(await readFile(groups.core.file, 'utf8')).toContain('<circle')
  })

  it('keeps Nuxt from prefetching sprites, so a group loads only when used or preloaded', async () => {
    const nuxt = await setup()
    const [, onManifest] = nuxt.hook.mock.calls.find(([hook]) => hook === 'build:manifest')!
    const src = relative(nuxt.options.srcDir, join(nuxt.options.rootDir, 'node_modules/.cache/mask-icons/abc.svg'))
    const manifest: Record<string, Record<string, unknown>> = {
      [src]: { src, file: 'abc.hash.svg', prefetch: true },
      'abc.hash.svg': { file: 'abc.hash.svg', prefetch: true },
      'assets/logo.svg': { src: 'assets/logo.svg', file: 'logo.hash.svg', prefetch: true },
    }
    onManifest(manifest)

    expect(manifest[src]).toMatchObject({ prefetch: false, preload: false })
    expect(manifest['abc.hash.svg']).toMatchObject({ prefetch: false, preload: false })
    expect(manifest['assets/logo.svg'].prefetch).toBe(true)
  })

  it('builds variants, types their values, and passes them to the Vite plugin and the app', async () => {
    const variants = { weight: { regular: { 'stroke-width': 1.5 }, bold: { 'stroke-width': 2 } } }
    const icons = { 'lazy/cart': { variants: ['weight'] } }
    const nuxt = await setup({ variants, icons })
    const [, groups] = nuxt.callHook.mock.calls[0]
    const types = vi.mocked(addTypeTemplate).mock.calls[0][0] as unknown as { getContents: () => string }
    const plugin = vi.mocked(addPluginTemplate).mock.calls[0][0] as unknown as { getContents: () => string }

    expect(groups.lazy.variants).toEqual({ cart: ['bold'] })
    expect(types.getContents()).toContain('"bold": true')
    expect(maskIcons).toHaveBeenCalledWith(expect.objectContaining({ variants, icons }))
    expect(plugin.getContents()).toContain('createMaskIcons({ sprites, variants })')
  })

  it('preloads the sprites of preloaded groups in the server-rendered head', async () => {
    await setup({ groups: { lazy: { preload: true } } })
    const plugin = vi.mocked(addPluginTemplate).mock.calls[0][0] as unknown as { getContents: () => string }

    expect(maskIcons).toHaveBeenCalledWith(expect.objectContaining({ groups: { lazy: { preload: true } } }))
    expect(plugin.getContents()).toContain('useHead({ link: preload.map((group) => preloadLink(sprites[group])) })')
  })

  it('registers the Vite plugin, the app plugin, the types and the component', async () => {
    await setup()
    const types = vi.mocked(addTypeTemplate).mock.calls[0][0] as unknown as { getContents: () => string }

    expect(addVitePlugin).toHaveBeenCalledWith(expect.objectContaining({ name: 'mask-icons' }))
    expect(addPluginTemplate).toHaveBeenCalledWith(expect.objectContaining({ filename: 'mask-icons.mjs' }))
    expect(types.getContents()).toContain('interface MaskIconRegistry')
    expect(addComponent).toHaveBeenCalledWith({ name: 'MaskIcon', export: 'MaskIcon', filePath: 'svg-mask-icons/vue' })
  })

  it('registers no component when `componentName` is false', async () => {
    await setup({ componentName: false })

    expect(addComponent).not.toHaveBeenCalled()
  })

  it('adds a Mask Icons tab to Nuxt DevTools in dev', async () => {
    const nuxt = await setup({}, true)
    const [name, callback] = nuxt.hook.mock.calls.find(([hook]) => hook === 'devtools:customTabs')!
    const tabs: unknown[] = []
    callback(tabs)

    expect(name).toBe('devtools:customTabs')
    expect(tabs).toEqual([expect.objectContaining({ title: 'Mask Icons', icon: '/__mask-icons/icon.svg', view: { type: 'iframe', src: '/__mask-icons/' } })])
  })

  it.each([
    ['in production', {}, false],
    ['with `gallery: false`', { gallery: false }, true],
  ])('adds no DevTools tab %s', async (_, options, dev) => {
    const nuxt = await setup(options, dev)

    expect(nuxt.hook).not.toHaveBeenCalledWith('devtools:customTabs', expect.anything())
  })

  it('shows gallery source paths relative to the Nuxt root', async () => {
    const nuxt = await setup()

    expect(maskIcons).toHaveBeenCalledWith(expect.objectContaining({ gallery: { root: nuxt.options.rootDir } }))
  })

  it('passes `gallery: false` to the Vite plugin', async () => {
    await setup({ gallery: false })

    expect(maskIcons).toHaveBeenCalledWith(expect.objectContaining({ gallery: false }))
  })
})
