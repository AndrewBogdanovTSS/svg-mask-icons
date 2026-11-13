import type { AddressInfo } from 'node:net'
import { createServer as createHttpServer } from 'node:http'
import { join } from 'node:path'
import { createServer } from 'vite'
import { describe, expect, it } from 'vitest'
import { renderGallery } from '../src/core/gallery'
import maskIcons from '../src/vite'
import { fixtures, tmpDir } from './helpers'

const core = {
  icons: ['close', 'arrow'],
  sources: { close: join(fixtures, 'override/close.svg'), arrow: join(fixtures, 'base/arrow.svg') },
  variants: {},
  file: join(fixtures, '.cache/abc123.svg'),
  cached: true,
}
const lazy = {
  icons: ['cart'],
  sources: { cart: join(fixtures, 'base/lazy/cart.svg') },
  variants: { cart: ['bold', 'bold~solid'] },
  file: join(fixtures, '.cache/def456.svg'),
  cached: true,
}

describe('renderGallery', () => {
  it('lists every icon by group with its preview and source file', () => {
    const html = renderGallery({ core, lazy }, fixtures, ['core'])

    expect(html).toContain('<output id="count">3 icons</output>')
    expect(html).toContain('<h2>core <span>preloaded</span></h2>')
    expect(html).toContain('<h2>lazy</h2>')
    expect(html).toContain('data-name="close" title="override/close.svg"')
    expect(html).toContain('--icon:url(\'/__mask-icons/sprite/core.svg?v=abc123.svg#close\')')
    expect(html).toContain('--icon:url(\'/__mask-icons/sprite/lazy.svg?v=def456.svg#cart\')')
    expect(html).toContain('<b>arrow</b><span class="variants"></span><small>base/arrow.svg</small>')
  })

  it('previews the variants of an icon', () => {
    const html = renderGallery({ core, lazy }, fixtures)

    expect(html).toContain('<i class="variant" title="bold" style="--icon:url(\'/__mask-icons/sprite/lazy.svg?v=def456.svg#cart~bold\')"></i>')
    expect(html).toContain('title="bold solid" style="--icon:url(\'/__mask-icons/sprite/lazy.svg?v=def456.svg#cart~bold~solid\')"')
    expect(html).toContain('<b>arrow</b><span class="variants"></span><small>')
  })

  it('leaves out empty groups', () => {
    expect(renderGallery({ core: { ...core, icons: [] }, lazy }, fixtures)).not.toContain('<h2>core')
  })

  it('escapes icon names', () => {
    const html = renderGallery({ core: { ...core, icons: ['a"<b>\''], sources: { 'a"<b>\'': core.sources.close } } }, fixtures)

    expect(html).toContain('data-name="a&#34;&#60;b&#62;&#39;"')
    expect(html).toContain('#a%22%3Cb%3E%27\')')
  })

  it('announces a copied name in a live region', () => {
    const html = renderGallery({ core }, fixtures)

    expect(html).toContain('<div id="toast" role="status" aria-live="polite"></div>')
    expect(html).toContain('Copied to clipboard')
  })
})

describe('gallery dev route', () => {
  const serve = async (gallery?: false) => {
    const root = await tmpDir('gallery')
    const vite = await createServer({
      root,
      logLevel: 'silent',
      configFile: false,
      server: { middlewareMode: true, ws: false },
      plugins: [maskIcons({ dirs: [join(fixtures, 'override'), join(fixtures, 'base')], dts: false, gallery })],
    })
    await vite.pluginContainer.buildStart({})
    const http = createHttpServer(vite.middlewares)
    await new Promise<void>((done) => http.listen(0, '127.0.0.1', done))
    const base = `http://127.0.0.1:${(http.address() as AddressInfo).port}`

    return {
      get: (path: string) => fetch(`${base}${path}`),
      close: async () => {
        http.close()
        await vite.close()
      },
    }
  }

  it('serves the gallery page and the sprite of each group it previews', async () => {
    const server = await serve()
    try {
      const page = await server.get('/__mask-icons/')
      const html = await page.text()
      const spriteOf = (name: string) => html.match(new RegExp(`url\\('([^#']+)#${name}'`))![1]
      const core = await server.get(spriteOf('close'))
      const lazy = await server.get(spriteOf('cart'))

      expect(page.headers.get('content-type')).toContain('text/html')
      expect(html).toContain('data-name="close"')
      expect(html).toContain('data-name="arrow"')
      expect(html).toContain('<h2>core <span>preloaded</span></h2>')
      expect(core.headers.get('content-type')).toBe('image/svg+xml')
      expect(await core.text()).toContain('id="close"')
      expect(await lazy.text()).toContain('id="cart"')
      expect((await server.get('/__mask-icons/sprite/missing.svg')).headers.get('content-type') ?? '').not.toBe('image/svg+xml')
    }
    finally {
      await server.close()
    }
  })

  it('serves its own icon for the DevTools tab', async () => {
    const server = await serve()
    try {
      const icon = await server.get('/__mask-icons/icon.svg')

      expect(icon.headers.get('content-type')).toBe('image/svg+xml')
      expect(await icon.text()).toContain('<svg')
    }
    finally {
      await server.close()
    }
  })

  it('is off with `gallery: false`', async () => {
    const server = await serve(false)
    try {
      expect((await server.get('/__mask-icons/')).headers.get('content-type') ?? '').not.toContain('text/html; charset=utf-8')
    }
    finally {
      await server.close()
    }
  })
})
