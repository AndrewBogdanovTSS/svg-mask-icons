import { execFile } from 'node:child_process'
import { promises as fs } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'
import { renderTypes } from '../src/core/types'
import { tmpDir } from './helpers'

const tsc = join(dirname(createRequire(import.meta.url).resolve('typescript/package.json')), 'bin/tsc')
const vue = join(import.meta.dirname, '../src/vue.ts')

// A consumer file that imports the virtual module and the Vue entry with no
// declarations of its own. Each `@ts-expect-error` fails the check when its
// line type-checks, so the registries must reject unknown values.
const app = `import { icons, preload, sprites, variants } from 'virtual:mask-icons'
import { createMaskIcons, MaskIcon, type MaskIconGroup, type MaskIconName, type MaskIconVariant } from 'svg-mask-icons/vue'

export const sprite: string = sprites.core
// @ts-expect-error a sprite URL is a string
export const notNumber: number = sprites.core
export const groups: string[] = preload
export const names: string[] = icons.core
export const plugin = createMaskIcons({ sprites, variants })
export const component = MaskIcon

export const group: MaskIconGroup = 'lazy'
// @ts-expect-error unknown group
export const unknownGroup: MaskIconGroup = 'missing'
export const name: MaskIconName = 'arrow'
// @ts-expect-error unknown icon
export const unknownName: MaskIconName = 'missing'
export const variant: MaskIconVariant = 'thin bold'
// @ts-expect-error unknown variant
export const unknownVariant: MaskIconVariant = 'missing'
`

/** Type-checks `app` against the generated declarations, as a consumer project would. */
const typecheck = async (dts: string) => {
  const root = await tmpDir('types')
  await fs.writeFile(join(root, 'mask-icons.d.ts'), dts)
  await fs.writeFile(join(root, 'app.ts'), app)
  await fs.writeFile(join(root, 'tsconfig.json'), JSON.stringify({
    compilerOptions: {
      target: 'ES2022',
      lib: ['ES2022', 'DOM'],
      module: 'ESNext',
      moduleResolution: 'Bundler',
      strict: true,
      skipLibCheck: true,
      noEmit: true,
      types: [],
      // The package's own source, so the check needs no build.
      paths: { 'svg-mask-icons/vue': [vue] },
    },
    files: ['app.ts', 'mask-icons.d.ts'],
  }))

  return promisify(execFile)(process.execPath, [tsc, '-p', root]).then(
    () => '',
    (err: { stdout?: string, message: string }) => err.stdout || err.message,
  )
}

describe('renderTypes', () => {
  it('types the virtual module and augments the Vue registries without a consumer shim', async () => {
    const dts = renderTypes({ core: { icons: ['close', 'arrow'] }, lazy: { icons: ['cart'] } }, ['thin', 'bold'])

    expect(await typecheck(dts)).toBe('')
  }, 60_000)
})
