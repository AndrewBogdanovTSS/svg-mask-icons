import type { MaskIconsConfig } from '../src/vue'
import { createSSRApp, h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { describe, expect, it, vi } from 'vitest'
import { createMaskIcons, MaskIcon } from '../src/vue'

const sprites = { core: '/assets/icons.svg', lazy: '/assets/lazy.svg' }

const render = (props: Record<string, unknown>, config: MaskIconsConfig | null = { sprites }) => {
  const app = createSSRApp({ render: () => h(MaskIcon, props) })
  if (config) app.use(createMaskIcons(config))
  // SSR escapes the quotes inside the style attribute.
  return renderToString(app).then((html) => html.replaceAll('&#39;', "'"))
}

describe('MaskIcon', () => {
  it('masks the core sprite fragment of the icon and paints currentColor', async () => {
    const html = await render({ name: 'close' })

    expect(html).toContain('aria-hidden="true"')
    expect(html).toContain('mask:url(\'/assets/icons.svg#close\') center / contain no-repeat;')
    expect(html).toContain('-webkit-mask:url(\'/assets/icons.svg#close\') center / contain no-repeat;')
    expect(html).toContain('background-color:currentColor;')
    expect(html).toContain('width:1em;height:1em;')
  })

  it('masks with the sprite of its `group`', async () => {
    expect(await render({ name: 'cart', group: 'lazy' })).toContain('mask:url(\'/assets/lazy.svg#cart\')')
  })

  it('masks with the fragment of a built variant', async () => {
    const variants = { axes: { weight: ['regular', 'bold'] }, defaults: { weight: 'regular' }, icons: { core: { close: ['bold'] } } }

    expect(await render({ name: 'close', variant: 'bold' }, { sprites, variants })).toContain('mask:url(\'/assets/icons.svg#close~bold\')')
  })

  it('falls back to the default icon, with a warning, for a variant not built', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const variants = { axes: { weight: ['regular', 'bold'] }, defaults: { weight: 'regular' }, icons: {} }

    expect(await render({ name: 'close', variant: 'bold' }, { sprites, variants })).toContain('mask:url(\'/assets/icons.svg#close\')')
    expect(warn.mock.calls.flat().join(' ')).toContain('has no variant "bold"')
    warn.mockRestore()
  })

  it('masks with `src` instead of the sprite', async () => {
    expect(await render({ src: '/logo.svg', name: 'close' })).toContain('mask:url(\'/logo.svg\')')
  })

  it('reads numbers as pixels and lets width and height override size', async () => {
    expect(await render({ name: 'close', size: 24, height: '2rem' })).toContain('width:24px;height:2rem;')
  })

  it('rotates to `dir` and positions with `pos`', async () => {
    const html = await render({ name: 'arrow', dir: 'up', pos: 'left' })

    expect(html).toContain('#arrow\') left / contain')
    expect(html).toContain('transform:rotate(-90deg);')
  })

  it.each([
    ['no name or src', {}, { sprites }, 'needs a `name` or a `src`'],
    ['no sprites provided', { name: 'close' }, null, 'No sprites provided'],
    ['an unknown group', { name: 'close', group: 'missing' }, { sprites }, 'Unknown icon group "missing"'],
  ])('warns and renders no mask with %s', async (_, props, config, message) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const html = await render(props, config)

    expect(html).not.toContain('mask:')
    // Vue's warn() appends the component trace as extra console arguments.
    expect(warn.mock.calls.flat().join(' ')).toContain(message)
    warn.mockRestore()
  })
})
