import type { SpriteGroups } from './sprite'
import { relative } from 'node:path'
import { VARIANT_SEPARATOR } from './variants'

/** Dev server route of the icon gallery. */
export const GALLERY_ROUTE = '/__mask-icons'

/** URL of the gallery's own icon, used for the Nuxt DevTools tab. */
export const GALLERY_ICON = `${GALLERY_ROUTE}/icon.svg`

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`)

const toUrl = (value: string) => encodeURIComponent(value).replaceAll("'", '%27')

/**
 * Renders the dev-only gallery of every icon, one section per group: a
 * searchable grid of previews drawn the way `<mask-icon>` draws them, with
 * each icon's source file. Clicking an icon copies its name.
 */
export const renderGallery = (groups: SpriteGroups, root: string, preload: string[] = []) => {
  const total = Object.values(groups).reduce((sum, { icons }) => sum + icons.length, 0)
  const sections = Object.entries(groups).filter(([, { icons }]) => icons.length).map(([group, { icons, sources, variants, file }]) => {
    const sprite = `${GALLERY_ROUTE}/sprite/${toUrl(group)}.svg?v=${toUrl(file.split(/[\\/]/).pop()!)}`
    const cards = icons.map((name) => {
      const source = relative(root, sources[name]).replaceAll('\\', '/')
      const previews = (variants[name] ?? []).map((suffix) => {
        const label = suffix.split(VARIANT_SEPARATOR).join(' ')
        return `<i class="variant" title="${escapeHtml(label)}" style="--icon:url('${sprite}#${toUrl(`${name}${VARIANT_SEPARATOR}${suffix}`)}')"></i>`
      }).join('')

      return `<li><button type="button" data-name="${escapeHtml(name)}" title="${escapeHtml(source)}">`
        + `<i style="--icon:url('${sprite}#${toUrl(name)}')"></i>`
        + `<b>${escapeHtml(name)}</b><span class="variants">${previews}</span><small>${escapeHtml(source)}</small></button></li>`
    }).join('\n')

    return `<details open>
<summary><h2>${escapeHtml(group)}${preload.includes(group) ? ' <span>preloaded</span>' : ''}</h2> <small>${icons.length}</small></summary>
<ul>
${cards}
</ul>
</details>`
  }).join('\n')

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>mask-icons</title>
<style>
  :root { color-scheme: light dark; --fg: #1f2328; --muted: #59636e; --line: #d1d9e0; --hover: #f6f8fa; --accent: #00a16c; }
  @media (prefers-color-scheme: dark) { :root { --fg: #e6edf3; --muted: #9198a1; --line: #3d444d; --hover: #151b23; } }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 16px; font: 14px/1.4 system-ui, sans-serif; color: var(--fg); background: Canvas; }
  header { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; margin-bottom: 16px; }
  h1 { margin: 0; font-size: 16px; }
  output { color: var(--muted); }
  input { flex: 1; min-width: 160px; padding: 6px 10px; font: inherit; color: inherit; background: transparent; border: 1px solid var(--line); border-radius: 6px; }
  ul { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 8px; margin: 0; padding: 0; list-style: none; }
  li { display: flex; }
  button { display: flex; flex-direction: column; align-items: center; gap: 6px; width: 100%; height: 100%; padding: 16px 8px 10px; font: inherit; color: inherit; text-align: center; background: transparent; border: 1px solid var(--line); border-radius: 8px; cursor: pointer; }
  button:hover, button:focus-visible { background: var(--hover); border-color: var(--accent); }
  button.copied { border-color: var(--accent); }
  i { width: 32px; height: 32px; background: currentColor; forced-color-adjust: none; mask: var(--icon) center / contain no-repeat; -webkit-mask: var(--icon) center / contain no-repeat; }
  /* One line, so a long name can't make its card taller than the rest. */
  b { max-width: 100%; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  /* Every card keeps a row for variant previews, so all cards line up. */
  .variants { display: flex; flex-wrap: wrap; gap: 6px; justify-content: center; min-height: 18px; }
  i.variant { width: 18px; height: 18px; }
  small { max-width: 100%; margin-top: auto; color: var(--muted); font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  details + details { margin-top: 20px; }
  summary { display: flex; gap: 8px; align-items: center; margin-bottom: 8px; cursor: pointer; user-select: none; }
  summary::before { content: '\\25B8'; color: var(--muted); font-size: 11px; transition: transform .15s; }
  details[open] > summary::before { transform: rotate(90deg); }
  summary::-webkit-details-marker { display: none; }
  summary small { margin-top: 0; }
  h2 { display: flex; gap: 8px; align-items: center; margin: 0; font-size: 13px; font-weight: 600; }
  h2 span { padding: 0 6px; color: var(--accent); font-size: 11px; font-weight: 500; border: 1px solid currentColor; border-radius: 999px; }
  [hidden] { display: none; }
  #toast { position: fixed; bottom: 16px; left: 50%; padding: 6px 12px; color: Canvas; background: var(--fg); border-radius: 6px; opacity: 0; transform: translate(-50%, 8px); transition: opacity .15s, transform .15s; pointer-events: none; }
  #toast.shown { opacity: 1; transform: translate(-50%, 0); }
</style>
</head>
<body>
<header>
  <h1>Icons</h1>
  <output id="count">${total} icons</output>
  <input id="search" type="search" placeholder="Filter by name" aria-label="Filter icons by name" autofocus>
</header>
<main id="icons">
${sections}
</main>
<div id="toast" role="status" aria-live="polite"></div>
<script>
  const items = [...document.querySelectorAll('#icons li')]
  const groups = [...document.querySelectorAll('#icons details')]
  const count = document.getElementById('count')
  document.getElementById('search').addEventListener('input', (event) => {
    const query = event.target.value.trim().toLowerCase()
    let shown = 0
    for (const item of items) {
      item.hidden = !item.querySelector('button').dataset.name.toLowerCase().includes(query)
      if (!item.hidden) shown++
    }
    for (const group of groups) {
      group.hidden = !group.querySelector('li:not([hidden])')
      // Filtering shows its matches, also in a collapsed group.
      if (query && !group.hidden) group.open = true
    }
    count.textContent = shown === items.length ? items.length + ' icons' : shown + ' of ' + items.length + ' icons'
  })
  const toast = document.getElementById('toast')
  let hideToast
  const notify = (message) => {
    toast.textContent = message
    toast.classList.add('shown')
    clearTimeout(hideToast)
    hideToast = setTimeout(() => toast.classList.remove('shown'), 1500)
  }
  // An iframe without the clipboard-write permission (Nuxt DevTools tabs, for
  // one) rejects the Clipboard API, so fall back to a selection copy.
  const copy = async (text) => {
    try {
      await navigator.clipboard.writeText(text)
      return true
    }
    catch {
      const field = document.createElement('textarea')
      field.value = text
      document.body.append(field)
      field.select()
      const copied = document.execCommand('copy')
      field.remove()
      return copied
    }
  }
  document.getElementById('icons').addEventListener('click', async (event) => {
    const button = event.target.closest('button')
    if (!button) return
    const copied = await copy(button.dataset.name)
    notify(copied ? 'Copied to clipboard' : 'Copy failed')
    if (!copied) return
    button.classList.add('copied')
    setTimeout(() => button.classList.remove('copied'), 800)
  })
</script>
</body>
</html>
`
}
