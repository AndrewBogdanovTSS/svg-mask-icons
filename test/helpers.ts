import { randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { onTestFinished } from 'vitest'

export const fixtures = join(import.meta.dirname, 'fixtures')

const tmpRoot = join(import.meta.dirname, '.tmp')

/**
 * Creates an empty folder under test/.tmp, removed when the test that made it ends.
 * Kept in the repo, not the OS temp folder, so test output stays on the
 * project's drive.
 */
export const tmpDir = async (name: string) => {
  const dir = join(tmpRoot, `${name}-${randomUUID().slice(0, 8)}`)
  await fs.mkdir(dir, { recursive: true })
  onTestFinished(() => fs.rm(dir, { recursive: true, force: true }))
  return dir
}

/** Copies a fixture icon folder into `dir`, so a test can change its icons. */
export const copyFixture = async (name: 'base' | 'override', dir: string) => {
  await fs.cp(join(fixtures, name), dir, { recursive: true })
  return dir
}
