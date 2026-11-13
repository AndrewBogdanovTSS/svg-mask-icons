export default defineNuxtConfig({
  // The layer ships the icons: core ones plus the `account` and `checkout` groups.
  extends: ['./layer'],
  modules: ['svg-mask-icons/nuxt'],
  maskIcons: {
    variants: {
      weight: { regular: { 'stroke-width': 1.5 }, thin: { 'stroke-width': 0.75 }, bold: { 'stroke-width': 2.5 } },
      style: { outline: { fill: 'none' }, solid: { fill: '#000' } },
    },
    // Only these icons get variants; every other icon stays as drawn. Their
    // stroke attributes sit on the root <svg>, where variants can change them.
    // Listing variants builds exactly those; `['weight', 'style']` would also
    // build `thin solid` and `bold solid`, which look like `solid`.
    icons: {
      heart: { variants: ['thin', 'bold', 'solid'] },
      bookmark: { variants: ['thin', 'bold', 'solid'] },
    },
  },
  compatibilityDate: '2026-11-01',
})
