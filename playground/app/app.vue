<script setup lang="ts">
import type { MaskIconDir, MaskIconVariant } from 'svg-mask-icons/vue'
import { icons, preload, sprites } from 'virtual:mask-icons'

const THEME_KEY = 'svg-mask-icons-theme'

useHead({
  title: 'svg-mask-icons playground',
  link: [
    { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
    { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
    { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Outfit:wght@500&display=swap' }
  ],
  // Applies a saved theme before the first paint, so the page doesn't flash
  // the system theme first.
  script: [{ innerHTML: `try{var t=localStorage.getItem('${THEME_KEY}');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}` }]
})

// The theme follows the system until the toggle picks one, saved per browser.
const theme = ref<'light' | 'dark'>()
onMounted(() => {
  const picked = document.documentElement.dataset.theme
  theme.value = picked === 'light' || picked === 'dark' ? picked : matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
})
const toggleTheme = () => {
  theme.value = theme.value === 'dark' ? 'light' : 'dark'
  document.documentElement.dataset.theme = theme.value
  try {
    localStorage.setItem(THEME_KEY, theme.value)
  }
  catch {
    // Storage can be blocked; the theme still applies to this visit.
  }
}

const installCommand = 'pnpm add svg-mask-icons -D'
const copied = ref(false)
const copyInstall = async () => {
  await navigator.clipboard.writeText(installCommand)
  copied.value = true
  setTimeout(() => (copied.value = false), 1500)
}

// The icon gallery is served by the dev server only.
const dev = import.meta.dev

const sizes = [16, 24, 32, 48]
const directions: MaskIconDir[] = ['right', 'down', 'left', 'up']
const variants: { label: string, variant?: MaskIconVariant }[] = [
  { label: 'thin', variant: 'thin' },
  { label: 'regular (default)' },
  { label: 'bold', variant: 'bold' },
  { label: 'solid', variant: 'solid' }
]

const favorite = ref(false)

// Groups other than `core` render on demand, so their sprites download only then.
const lazyGroups = Object.keys(icons).filter((group) => group !== 'core')
const shownGroups = ref<string[]>([])
const downloaded = ref<string[]>([])

const showGroup = (group: string) => {
  if (!shownGroups.value.includes(group)) shownGroups.value.push(group)
}

// Watches the browser's resource timing for sprite requests, so the page can
// show which group sprites were actually downloaded.
let observer: PerformanceObserver | undefined
onMounted(() => {
  const groupByPath = Object.fromEntries(Object.entries(sprites).map(([group, url]) => [new URL(url, location.href).pathname, group]))
  observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      const group = groupByPath[new URL(entry.name).pathname]
      if (group && !downloaded.value.includes(group)) downloaded.value.push(group)
    }
  })
  observer.observe({ type: 'resource', buffered: true })
})
onBeforeUnmount(() => observer?.disconnect())
</script>

<template>
  <header class="topbar">
    <div class="container topbar-inner">
      <span class="brand"><mask-icon name="bookmark" variant="solid" class="brand-icon" /> svg-mask-icons</span>
      <nav class="links">
        <a v-if="dev" href="/__mask-icons/">Icon gallery</a>
        <a href="https://www.npmjs.com/package/svg-mask-icons">npm</a>
        <a href="https://github.com/AndrewBogdanovTSS/svg-mask-icons">GitHub</a>
      </nav>
      <button
        type="button"
        class="theme-toggle"
        :aria-label="theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'"
        @click="toggleTheme"
      >
        <!-- Shown once mounted: the server can't know the saved or system theme. -->
        <mask-icon v-if="theme" :name="theme === 'dark' ? 'sun' : 'moon'" />
      </button>
    </div>
  </header>

  <div class="container">
    <section class="hero">
      <span class="pill">Vite · Vue · Nuxt</span>
      <h1>SVG icons from <span class="accent">CSS-masked sprites</span></h1>
      <p>One element per icon, painted with the text color. Sprites split into groups that load on demand, with variants built in at build time.</p>
      <div class="actions">
        <a class="button primary" href="https://github.com/AndrewBogdanovTSS/svg-mask-icons#install">Get started <mask-icon name="arrow-circle" /></a>
        <button type="button" class="button subtle mono" :aria-label="`Copy ${installCommand}`" @click="copyInstall">
          {{ installCommand }}
          <mask-icon v-if="copied" name="check-circle" class="accent" />
        </button>
      </div>
    </section>

    <main class="sections">
      <section>
        <h2>Color follows the text</h2>
        <p>An icon is painted with <code>currentColor</code>, so it takes the color of the text around it, hover states included.</p>
        <div class="row">
          <a class="swatch violet" href="#" @click.prevent><mask-icon name="heart" /> Violet</a>
          <a class="swatch blue" href="#" @click.prevent><mask-icon name="location" /> Blue</a>
          <a class="swatch green" href="#" @click.prevent><mask-icon name="check-circle" /> Green</a>
          <a class="swatch hover" href="#" @click.prevent><mask-icon name="arrow-circle" /> Hover me</a>
        </div>
        <pre><code>&lt;a style="color: #8b5cf6"&gt;&lt;mask-icon name="heart" /&gt; Violet&lt;/a&gt;</code></pre>
      </section>

      <section>
        <h2>Size</h2>
        <p>Icons are <code>1em</code> by default. <code>size</code> takes any length; a number is in pixels.</p>
        <div class="row">
          <figure v-for="size in sizes" :key="size">
            <mask-icon name="filters" :size="size" />
            <figcaption>{{ size }}px</figcaption>
          </figure>
        </div>
        <pre><code>&lt;mask-icon name="filters" :size="32" /&gt;</code></pre>
      </section>

      <section>
        <h2>Direction</h2>
        <p><code>dir</code> rotates an icon drawn pointing right, with a short transition.</p>
        <div class="row">
          <figure v-for="dir in directions" :key="dir">
            <mask-icon name="arrow-circle" :dir="dir" :size="32" />
            <figcaption>{{ dir }}</figcaption>
          </figure>
        </div>
        <pre><code>&lt;mask-icon name="arrow-circle" dir="down" /&gt;</code></pre>
      </section>

      <section>
        <h2>Variants</h2>
        <p>Stroke weights and fills are built into the sprite at build time, and <code>variant</code> picks one. These two icons get <code>['thin', 'bold', 'solid']</code> in <code>nuxt.config.ts</code>.</p>
        <div class="variants">
          <template v-for="name in (['heart', 'bookmark'] as const)" :key="name">
            <figure v-for="{ label, variant } in variants" :key="`${name}-${label}`">
              <mask-icon :name="name" :variant="variant" :size="40" />
              <figcaption>{{ label }}</figcaption>
            </figure>
          </template>
        </div>
        <div class="row">
          <button type="button" class="button" :aria-pressed="favorite" @click="favorite = !favorite">
            <mask-icon name="heart" :variant="favorite ? 'solid' : undefined" />
            {{ favorite ? 'Saved to favorites' : 'Add to favorites' }}
          </button>
        </div>
        <pre><code>&lt;mask-icon name="heart" :variant="favorite ? 'solid' : undefined" /&gt;</code></pre>
      </section>

      <section>
        <h2>Groups load on demand</h2>
        <p>Each subfolder of the icon folder is a group with a sprite of its own. The browser downloads a sprite only when one of its icons renders; <code>core</code> is preloaded.</p>
        <ul class="groups">
          <li v-for="group in Object.keys(icons)" :key="group">
            <div class="group-head">
              <strong>{{ group }}</strong>
              <span class="count">{{ icons[group].length }} icons</span>
              <span v-if="preload.includes(group)" class="badge">preloaded</span>
              <span class="badge" :class="{ off: !downloaded.includes(group) }">
                {{ downloaded.includes(group) ? 'downloaded' : 'not downloaded' }}
              </span>
              <button v-if="lazyGroups.includes(group) && !shownGroups.includes(group)" type="button" class="button small" @click="showGroup(group)">
                Show icons
              </button>
            </div>
            <div v-if="!lazyGroups.includes(group) || shownGroups.includes(group)" class="icon-grid">
              <span v-for="name in icons[group]" :key="name" :title="name">
                <mask-icon :group="group" :name="name" :size="24" />
              </span>
            </div>
          </li>
        </ul>
        <pre><code>&lt;mask-icon group="account" name="user-plus" /&gt;</code></pre>
      </section>

      <section>
        <h2>In context</h2>
        <p>Icons are decorative (<code>aria-hidden</code>), so the controls around them carry the labels.</p>
        <div class="context">
          <label class="search">
            <mask-icon name="zoom-in" />
            <input type="search" placeholder="Search products" aria-label="Search products">
          </label>
          <div class="toolbar" role="toolbar" aria-label="Results">
            <button type="button" aria-label="Filters"><mask-icon name="filters" /></button>
            <button type="button" aria-label="Stores near me"><mask-icon name="location" /></button>
            <button type="button" aria-label="Refresh"><mask-icon name="rotate-right" /></button>
            <button type="button" aria-label="Clear"><mask-icon name="cross" /></button>
          </div>
          <p class="alert" role="status">
            <mask-icon name="check-circle" /> Your order was placed.
          </p>
          <button type="button" class="button subtle">
            Continue <mask-icon name="arrow-circle" />
          </button>
        </div>
      </section>
    </main>

    <footer>
      <template v-if="dev">
        Open <a href="/__mask-icons/">/__mask-icons/</a> or the <strong>Mask Icons</strong> tab in Nuxt DevTools to browse every icon.
      </template>
      <template v-else>
        Run the <a href="https://github.com/AndrewBogdanovTSS/svg-mask-icons/tree/main/playground">playground</a> locally to browse every icon in the dev gallery and Nuxt DevTools.
      </template>
    </footer>
  </div>
</template>


<style>
/* Tokens follow the Nuxt design system (nuxt.com/design.md): neutral surfaces,
   green primary (-500 in light mode, -400 in dark), Outfit headings, Inter body. */
:root {
  color-scheme: light;
  --bg: #ffffff;
  --bg-muted: #fafafa;
  --bg-elevated: #f5f5f5;
  --bg-accented: #e5e5e5;
  --border: #e5e5e5;
  --text: #404040;
  --text-highlighted: #171717;
  --text-muted: #737373;
  --primary: #00c16a;
  --on-primary: #ffffff;
  --violet: #8b5cf6;
  --blue: #3b82f6;
  --font-heading: 'Outfit', system-ui, sans-serif;
  --font-sans: 'Inter', system-ui, sans-serif;
  --font-mono: ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace;
}

/* Dark follows the system unless the toggle picked a theme (`data-theme` on <html>). */
:root[data-theme="dark"] {
  color-scheme: dark;
  --bg: #0a0a0a;
  --bg-muted: #171717;
  --bg-elevated: #171717;
  --bg-accented: #262626;
  --border: #262626;
  --text: #d4d4d4;
  --text-highlighted: #ffffff;
  --text-muted: #a3a3a3;
  --primary: #00dc82;
  --on-primary: #0a0a0a;
  --violet: #a78bfa;
  --blue: #60a5fa;
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    color-scheme: dark;
    --bg: #0a0a0a;
    --bg-muted: #171717;
    --bg-elevated: #171717;
    --bg-accented: #262626;
    --border: #262626;
    --text: #d4d4d4;
    --text-highlighted: #ffffff;
    --text-muted: #a3a3a3;
    --primary: #00dc82;
    --on-primary: #0a0a0a;
    --violet: #a78bfa;
    --blue: #60a5fa;
  }
}

* { box-sizing: border-box; }

body {
  margin: 0;
  font: 16px/1.6 var(--font-sans);
  color: var(--text);
  background: var(--bg);
  -webkit-font-smoothing: antialiased;
}

h1, h2 { margin: 0; font-family: var(--font-heading); font-weight: 500; color: var(--text-highlighted); }
a { color: var(--primary); text-decoration: none; }
a:hover { text-decoration: underline; }
.accent { color: var(--primary); }

.container { max-width: 1024px; margin: 0 auto; padding: 0 16px; }

/* Sticky chrome is the one place the design blurs. */
.topbar { position: sticky; top: 0; z-index: 10; background: color-mix(in srgb, var(--bg) 75%, transparent); border-bottom: 1px solid var(--border); backdrop-filter: blur(8px); }
.topbar-inner { display: flex; gap: 16px; align-items: center; height: 64px; }
.brand { display: inline-flex; gap: 8px; align-items: center; font-family: var(--font-heading); font-size: 18px; font-weight: 500; color: var(--text-highlighted); }
.brand-icon { color: var(--primary); }
.links { display: flex; gap: 20px; margin-left: auto; font-size: 14px; font-weight: 500; }
.links a { color: var(--text-muted); }
.links a:hover { color: var(--text-highlighted); text-decoration: none; }
.theme-toggle { display: grid; place-items: center; width: 36px; height: 36px; margin-left: 4px; font-size: 18px; color: var(--text-muted); background: transparent; border: 0; border-radius: 6px; cursor: pointer; }
.theme-toggle:hover { color: var(--text-highlighted); background: var(--bg-accented); }

.hero { display: flex; flex-direction: column; gap: 20px; align-items: center; padding: 80px 0; text-align: center; }
.hero h1 { max-width: 760px; font-size: clamp(36px, 6vw, 60px); line-height: 1.1; letter-spacing: -0.02em; }
.hero p { max-width: 620px; margin: 0; font-size: 18px; color: var(--text-muted); }
.pill { padding: 2px 12px; font-size: 13px; font-weight: 500; color: var(--text-muted); border: 1px solid var(--border); border-radius: 999px; }
.actions { display: flex; flex-wrap: wrap; gap: 12px; justify-content: center; }

.button { display: inline-flex; gap: 8px; align-items: center; padding: 8px 14px; font: 500 14px/1.5 var(--font-sans); color: var(--text-highlighted); background: var(--bg-elevated); border: 1px solid var(--border); border-radius: 6px; cursor: pointer; transition: background .15s, border-color .15s; }
.button:hover { text-decoration: none; background: var(--bg-accented); }
.button.primary { color: var(--on-primary); background: var(--primary); border-color: var(--primary); }
.button.primary:hover { background: color-mix(in srgb, var(--primary) 85%, var(--text-highlighted)); }
.button.mono { font-family: var(--font-mono); font-weight: 400; }
.button.small { padding: 2px 10px; font-size: 13px; }
.button[aria-pressed="true"] { color: var(--primary); border-color: var(--primary); }

.sections { display: grid; gap: 16px; padding-bottom: 48px; }
.sections section { padding: 24px; background: var(--bg); border: 1px solid var(--border); border-radius: 8px; }
.sections h2 { margin-bottom: 4px; font-size: 20px; }
.sections section > p { max-width: 65ch; margin: 0 0 20px; color: var(--text-muted); }

code { padding: 1px 5px; font: 13px/1.4 var(--font-mono); color: var(--text-highlighted); background: var(--bg-elevated); border-radius: 4px; }
pre { margin: 20px 0 0; padding: 12px 16px; overflow-x: auto; background: var(--bg-muted); border: 1px solid var(--border); border-radius: 6px; }
pre code { padding: 0; background: none; }

.row { display: flex; flex-wrap: wrap; gap: 28px; align-items: center; }
/* Captions share a baseline whatever the icon size. */
.row:has(> figure) { align-items: end; }
figure { display: flex; flex-direction: column; align-items: center; gap: 6px; min-width: 64px; margin: 0; color: var(--text-highlighted); }
figcaption { font-size: 13px; color: var(--text-muted); }

.swatch { display: inline-flex; gap: 6px; align-items: center; font-weight: 500; }
.swatch:hover { text-decoration: none; }
.swatch.violet { color: var(--violet); }
.swatch.blue { color: var(--blue); }
.swatch.green { color: var(--primary); }
.swatch.hover { color: var(--text-highlighted); transition: color .15s; }
.swatch.hover:hover { color: var(--primary); }

.variants { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 20px 8px; margin-bottom: 20px; }
.variants figure { color: var(--primary); }

.groups { display: grid; gap: 12px; margin: 0; padding: 0; list-style: none; }
.groups li { padding: 12px 16px; background: var(--bg-muted); border-radius: 6px; }
.group-head { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.group-head strong { font-weight: 600; color: var(--text-highlighted); }
.count { font-size: 13px; color: var(--text-muted); }
.badge { padding: 0 8px; font-size: 12px; font-weight: 500; color: var(--primary); background: color-mix(in srgb, var(--primary) 12%, transparent); border-radius: 4px; }
.badge.off { color: var(--text-muted); background: var(--bg-accented); }
.icon-grid { display: flex; flex-wrap: wrap; gap: 14px; margin-top: 12px; color: var(--text-highlighted); }

.context { display: grid; gap: 16px; justify-items: start; }
.search { display: flex; gap: 8px; align-items: center; width: min(100%, 320px); padding: 8px 12px; color: var(--text-muted); border: 1px solid var(--border); border-radius: 6px; }
.search input { flex: 1; min-width: 0; font: inherit; color: var(--text-highlighted); background: transparent; border: 0; outline: 0; }
.search:focus-within { color: var(--primary); border-color: var(--primary); }
.toolbar { display: flex; gap: 4px; padding: 4px; border: 1px solid var(--border); border-radius: 8px; }
.toolbar button { display: grid; place-items: center; width: 36px; height: 36px; font-size: 20px; color: var(--text-muted); background: transparent; border: 0; border-radius: 6px; cursor: pointer; }
.toolbar button:hover { color: var(--text-highlighted); background: var(--bg-accented); }
.alert { display: flex; gap: 8px; align-items: center; margin: 0; padding: 10px 14px; font-weight: 500; color: var(--primary); background: color-mix(in srgb, var(--primary) 10%, transparent); border-radius: 6px; }

footer { padding: 24px 0 48px; font-size: 14px; text-align: center; color: var(--text-muted); border-top: 1px solid var(--border); }

@media (max-width: 640px) {
  .hero { padding: 40px 0; }
  .variants { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .links { gap: 12px; }
}
</style>
