import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { fixtures, tmpDir } from './helpers'

// The real context functions, with the helpers replaced by recorders that note
// which Nuxt instance `useNuxt()` returns when they run.
const seen = vi.hoisted(() => [] as Array<{ helper: string, nuxt: unknown }>)

vi.mock('@nuxt/kit', async (importOriginal) => {
  const kit = await importOriginal<typeof import('@nuxt/kit')>()
  const record = (helper: string) => vi.fn(() => {
    seen.push({ helper, nuxt: kit.useNuxt() })
  })
  return {
    ...kit,
    addComponent: record('addComponent'),
    addPluginTemplate: record('addPluginTemplate'),
    addTypeTemplate: record('addTypeTemplate'),
    addVitePlugin: record('addVitePlugin'),
    defineNuxtModule: vi.fn((definition) => definition),
    useLogger: vi.fn(() => ({ warn: vi.fn() })),
  }
})

const { nuxtCtx } = await import('@nuxt/kit')
const { default: module } = await import('../src/nuxt')

type Definition = {
  defaults: Record<string, unknown>
  setup: (options: Record<string, unknown>, nuxt: unknown) => Promise<void>
}

const definition = module as unknown as Definition

const fakeNuxt = async (name: string) => {
  const rootDir = await tmpDir(name)
  return {
    callHook: vi.fn(),
    hook: vi.fn(),
    options: {
      dev: false,
      rootDir,
      srcDir: join(rootDir, 'app'),
      _layers: [{ config: { srcDir: join(fixtures, 'base') } }],
    },
  }
}

describe('maskIcons (nuxt) - Nuxt context', () => {
  // A host app whose Nuxt runs on another copy of @nuxt/kit never sets this
  // copy's async context, so `useNuxt()` falls back to the process-wide
  // instance: the last Nuxt that was loaded. Vitest loads one Nuxt per project
  // concurrently, so that can be a different instance from the one being set up.
  it('registers everything on the Nuxt it was set up for, not the process-wide one', async () => {
    const own = await fakeNuxt('own')
    const other = await fakeNuxt('other')
    seen.length = 0
    nuxtCtx.set(other as never)

    try {
      await definition.setup({ ...definition.defaults, dir: '' }, own)
    }
    finally {
      nuxtCtx.unset()
    }

    expect(seen.map(({ helper }) => helper)).toEqual(['addTypeTemplate', 'addVitePlugin', 'addPluginTemplate', 'addComponent'])
    expect(seen.every(({ nuxt }) => nuxt === own)).toBe(true)
  })
})
