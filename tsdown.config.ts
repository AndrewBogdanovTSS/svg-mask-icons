import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    vite: 'src/vite.ts',
    vue: 'src/vue.ts',
    nuxt: 'src/nuxt.ts',
  },
  format: ['esm'],
  platform: 'neutral',
  target: 'es2022',
  outDir: 'dist',
  deps: {
    neverBundle: [
      '@nuxt/kit',
      '@nuxt/schema',
      '@xmldom/xmldom',
      'svgo',
      'vite',
      'vue',
      /^node:/,
    ],
  },
  dts: true,
  clean: true,
  hash: false,
  outExtensions: () => ({ js: '.mjs', dts: '.d.mts' }),
  publint: true,
  attw: true,
})
