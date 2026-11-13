import type { VariantManifest } from './core/variants'
import type { InjectionKey, Plugin, PropType } from 'vue'
import { computed, defineComponent, h, inject, warn } from 'vue'
import { DEFAULT_GROUP } from './core/types'
import { variantFragment } from './core/variants'

/**
 * Icon names of each group, as a union per group name. Empty here; the
 * generated declarations (`mask-icons.d.ts`, or the Nuxt type template)
 * augment it.
 */
export interface MaskIconRegistry {}

/** An icon group, or any string until types are generated. */
export type MaskIconGroup = keyof MaskIconRegistry extends never ? string : Extract<keyof MaskIconRegistry, string>

/** An icon name from any group, or any string until types are generated. */
export type MaskIconName = keyof MaskIconRegistry extends never ? string : Extract<MaskIconRegistry[keyof MaskIconRegistry], string>

/**
 * Variant values of every axis. Empty here; the generated declarations
 * augment it.
 */
export interface MaskIconVariantRegistry {}

type VariantValue = Extract<keyof MaskIconVariantRegistry, string>

/**
 * One variant value, or two from different axes separated by a space, such as
 * `'bold solid'`. Any string until types are generated.
 */
export type MaskIconVariant = keyof MaskIconVariantRegistry extends never ? string : VariantValue | `${VariantValue} ${VariantValue}`

/** Variant axes, their defaults and the variants built per icon - `variants` from `virtual:mask-icons`. */
export type MaskIconVariantManifest = VariantManifest

/** Direction an icon points to; icons are drawn pointing right. */
export type MaskIconDir = 'right' | 'left' | 'up' | 'down'

export interface MaskIconsConfig {
  /** Sprite URL of each icon group - `sprites` from `virtual:mask-icons`. */
  sprites: Record<string, string>
  /**
   * Groups whose sprite to preload - `preload` from `virtual:mask-icons`.
   * Adds a `<link rel="preload">` to the document head when the plugin is
   * installed in the browser. Nuxt preloads in the server-rendered head instead.
   */
  preload?: string[]
  /** Variants - `variants` from `virtual:mask-icons`. */
  variants?: MaskIconVariantManifest | null
}

export const maskIconsKey: InjectionKey<MaskIconsConfig> = Symbol('mask-icons')

/**
 * Attributes of a `<link>` that preloads a sprite. `crossorigin` matters: the
 * browser fetches mask images in CORS mode, and a preload only serves a fetch
 * made in the same mode.
 */
export const preloadLink = (href: string) => ({ rel: 'preload', as: 'image', href, crossorigin: 'anonymous' })

/**
 * Provides the sprites to every `<mask-icon>` in the app.
 *
 * ```ts
 * import { preload, sprites } from 'virtual:mask-icons'
 * app.use(createMaskIcons({ sprites, preload }))
 * ```
 */
export const createMaskIcons = (config: MaskIconsConfig): Plugin => ({
  install(app) {
    app.provide(maskIconsKey, config)
    if (typeof document === 'undefined') return

    for (const group of config.preload ?? []) {
      const href = config.sprites[group]
      if (!href || document.head.querySelector(`link[rel="preload"][href="${CSS.escape(href)}"]`)) continue
      const link = document.createElement('link')
      for (const [name, value] of Object.entries(preloadLink(href))) link.setAttribute(name, value)
      document.head.append(link)
    }
  },
})

const rotation: Record<MaskIconDir, number> = { right: 0, left: 180, up: -90, down: 90 }

const toLength = (value: string | number) => typeof value === 'number' ? `${value}px` : value

/**
 * Renders one icon as an `<i>` masked by the sprite, painted in `currentColor`.
 * It is decorative (`aria-hidden`); label the control that contains it.
 */
export const MaskIcon = defineComponent({
  name: 'MaskIcon',
  props: {
    /** Icon name in its group's sprite. */
    name: String as PropType<MaskIconName>,
    /** Group whose sprite holds the icon: its subfolder of the icon folder. */
    group: { type: String as PropType<MaskIconGroup>, default: DEFAULT_GROUP },
    /**
     * Variant values, one per axis, separated by spaces: `'bold'`,
     * `'bold solid'`. An axis left out keeps its default.
     */
    variant: String as PropType<MaskIconVariant>,
    /** Image URL to mask with instead of a sprite icon. */
    src: String,
    /** Width and height. A number is in pixels. */
    size: { type: [String, Number], default: '1em' },
    /** Width, overriding `size`. A number is in pixels. */
    width: [String, Number],
    /** Height, overriding `size`. A number is in pixels. */
    height: [String, Number],
    /** Rotates the icon to point this way. */
    dir: String as PropType<MaskIconDir>,
    /** `mask-position` of the icon inside its box. */
    pos: { type: String, default: 'center' },
  },
  setup(props) {
    const config = inject(maskIconsKey, null)

    const url = computed(() => {
      if (props.src) return props.src
      if (!props.name) {
        warn('[mask-icons] <mask-icon> needs a `name` or a `src`.')
        return ''
      }
      if (!config) {
        warn('[mask-icons] No sprites provided. Install `createMaskIcons({ sprites })` on the app.')
        return ''
      }
      const sprite = config.sprites[props.group]
      if (!sprite) {
        warn(`[mask-icons] Unknown icon group "${props.group}".`)
        return ''
      }
      const { id, warning } = variantFragment(config.variants, props.group, props.name, props.variant)
      if (warning) warn(`[mask-icons] ${warning}`)
      return `${sprite}#${id}`
    })

    return () => {
      const mask = url.value && `url('${url.value}') ${props.pos} / contain no-repeat`

      return h('i', {
        'aria-hidden': 'true',
        'style': {
          'display': 'inline-block',
          'flex-shrink': 0,
          'width': toLength(props.width ?? props.size),
          'height': toLength(props.height ?? props.size),
          'background-color': 'currentColor',
          // Forced colors would repaint the background as the page background
          // and hide the icon. currentColor already follows the forced text color.
          'forced-color-adjust': 'none',
          'mask': mask || undefined,
          '-webkit-mask': mask || undefined,
          ...(props.dir && { transform: `rotate(${rotation[props.dir]}deg)`, transition: 'transform 200ms' }),
        },
      })
    }
  },
})
