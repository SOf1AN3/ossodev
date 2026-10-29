<script lang="ts">
/**
 * Jeu d'icônes OSSO — pictogrammes d'interface au trait, grille 24×24,
 * `currentColor`. Ils remplacent les emojis d'interface (rendu différent
 * selon l'OS). Les emojis de gamification ne sont PAS concernés.
 */
export type IconName =
  | 'folder'
  | 'target'
  | 'flame'
  | 'zap'
  | 'shield'
  | 'clock'
  | 'search'
  | 'check'
  | 'close'
  | 'pencil'
  | 'sliders'
  | 'terminal'
  | 'brain'
  | 'calendar'
  | 'chart'
  | 'badge'
  | 'chevronRight'
  | 'chevronLeft'
  | 'plus'
  | 'trash'
  | 'arrowUp'
  | 'arrowDown'
  | 'sun'
  | 'moon'

/* Chemins tracés à la main. Typé en string|undefined pour que le repli
   (cercle) couvre aussi un nom inconnu passé depuis du JS non typé. */
const ICON_PATHS: Record<string, readonly string[] | undefined> = {
  folder: [
    'M3 7a2 2 0 0 1 2-2h3.7a2 2 0 0 1 1.5.7l1.2 1.3a2 2 0 0 0 1.5.7H19a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z',
  ],
  target: [
    'M20 12a8 8 0 1 1-16 0 8 8 0 1 1 16 0Z',
    'M16 12a4 4 0 1 1-8 0 4 4 0 1 1 8 0Z',
    'M12 12h.01',
  ],
  flame: [
    'M12 3c.7 2.5 2.2 3.8 3.5 5.2 1.3 1.5 2 3 2 4.8a5.5 5.5 0 0 1-11 0c0-1.8.8-3.4 2-4.6.1 1.3.7 2.3 1.6 2.9-.6-3.4 0-6.2 1.9-8.3Z',
    'M12 13.6c.9 1 1.4 1.9 1.4 2.8a1.4 1.4 0 0 1-2.8 0c0-.9.5-1.8 1.4-2.8Z',
  ],
  zap: ['M13 2.5 5.5 13.5H11l-1 8 8-11.5h-5.6L13 2.5Z'],
  shield: ['M12 3 5 5.9v5.5c0 4.3 2.9 7.9 7 9.6 4.1-1.7 7-5.3 7-9.6V5.9L12 3Z'],
  clock: [
    'M20 12a8 8 0 1 1-16 0 8 8 0 1 1 16 0Z',
    'M12 7.5V12l3 1.8',
  ],
  search: [
    'M18 11a7 7 0 1 1-14 0 7 7 0 1 1 14 0Z',
    'm16.1 16.1 4.4 4.4',
  ],
  check: ['m5 12.6 4.6 4.6L19 7.4'],
  close: ['m6.2 6.2 11.6 11.6', 'm17.8 6.2-11.6 11.6'],
  pencil: [
    'M4 20l.9-4.1L16.4 4.4a2.2 2.2 0 0 1 3 3L7.9 18.9 4 20Z',
    'm14.5 6.3 3.2 3.2',
  ],
  sliders: [
    'M4 7.5h16',
    'M4 12h16',
    'M4 16.5h16',
    'M10.75 7.5a1.75 1.75 0 1 1-3.5 0 1.75 1.75 0 1 1 3.5 0Z',
    'M16.75 12a1.75 1.75 0 1 1-3.5 0 1.75 1.75 0 1 1 3.5 0Z',
    'M9.75 16.5a1.75 1.75 0 1 1-3.5 0 1.75 1.75 0 1 1 3.5 0Z',
  ],
  terminal: ['m5.5 7 5 5-5 5', 'M12.5 17.5h6'],
  brain: [
    'M12 5.8A3.2 3.2 0 0 0 6.4 4 2.9 2.9 0 0 0 3.8 7.5a2.7 2.7 0 0 0 .6 5.3 3.3 3.3 0 0 0 2.7 5.9c1.5 0 2.9-.8 3.8-2',
    'M12 5.8a3.2 3.2 0 0 1 5.6-1.8 2.9 2.9 0 0 1 2.6 3.5 2.7 2.7 0 0 1-.6 5.3 3.3 3.3 0 0 1-2.7 5.9c-1.5 0-2.9-.8-3.8-2',
    'M12 5.8V16.8',
  ],
  calendar: [
    'M5 6.5h14a2 2 0 0 1 2 2V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8.5a2 2 0 0 1 2-2Z',
    'M8 3.5v4',
    'M16 3.5v4',
    'M3 11h18',
  ],
  chart: ['M4 20h16', 'M7.5 20v-5.5', 'M12 20v-11', 'M16.5 20v-8'],
  badge: [
    'M16.5 10.5a4.5 4.5 0 1 1-9 0 4.5 4.5 0 1 1 9 0Z',
    'M9.4 3.4 7.2 8.9l4.8 2.4 4.8-2.4-2.2-5.5',
    'm10.4 10.5 1.2 1.3 2.4-2.8',
  ],
  chevronRight: ['m9.5 5.5 7 6.5-7 6.5'],
  chevronLeft: ['m14.5 5.5-7 6.5 7 6.5'],
  plus: ['M12 5v14', 'M5 12h14'],
  trash: [
    'M4.5 7h15',
    'M9.5 7V5.2A1.7 1.7 0 0 1 11.2 3.5h1.6a1.7 1.7 0 0 1 1.7 1.7V7',
    'm6.5 7 .8 12a2 2 0 0 0 2 1.9h5.4a2 2 0 0 0 2-1.9l.8-12',
    'M10.3 11v6',
    'M13.7 11v6',
  ],
  arrowUp: ['M12 19.5V5', 'm5.8 11.2 6.2-6.2 6.2 6.2'],
  arrowDown: ['M12 4.5V19', 'm5.8 12.8 6.2 6.2 6.2-6.2'],
  sun: [
    'M17 12a5 5 0 1 1-10 0 5 5 0 1 1 10 0Z',
    'M12 6V3.4',
    'M12 18v2.6',
    'M6 12H3.4',
    'M18 12h2.6',
    'M7.75 7.75 5.9 5.9',
    'M16.25 7.75 18.1 5.9',
    'M7.75 16.25 5.9 18.1',
    'M16.25 16.25 18.1 18.1',
  ],
  moon: ['M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z'],
}

/* Nom inconnu → cercle simple. Jamais de crash. */
const FALLBACK_PATHS: readonly string[] = ['M20 12a8 8 0 1 1-16 0 8 8 0 1 1 16 0Z']
</script>

<script setup lang="ts">
interface UiIconProps {
  name: IconName
  size?: 'sm' | 'md' | 'lg'
  strokeWidth?: number
}

const props = withDefaults(defineProps<UiIconProps>(), {
  size: 'md',
  strokeWidth: 1.5,
})

const sizeClasses: Record<NonNullable<UiIconProps['size']>, string> = {
  sm: 'h-3.5 w-3.5',
  md: 'h-4 w-4',
  lg: 'h-5 w-5',
}

const paths = computed<readonly string[]>(
  () => ICON_PATHS[props.name] ?? FALLBACK_PATHS,
)
</script>

<template>
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-linecap="round"
    stroke-linejoin="round"
    :stroke-width="strokeWidth"
    :class="sizeClasses[size]"
    aria-hidden="true"
    focusable="false"
  >
    <path
      v-for="(d, index) in paths"
      :key="index"
      :d="d"
    />
  </svg>
</template>
