<script setup lang="ts">
// Barre de progression générique : sémantique ARIA complète,
// pourcentage affiché à l'intérieur quand la barre est épaisse (size="lg").
interface ProgressBarProps {
  value: number
  max: number
  label?: string
  tone?: 'accent' | 'ok'
  showPercent?: boolean
  size?: 'sm' | 'lg'
  /** Nom accessible explicite (prioritaire sur `label`). */
  ariaLabel?: string
}

const props = withDefaults(defineProps<ProgressBarProps>(), {
  label: undefined,
  tone: 'accent',
  showPercent: false,
  size: 'sm',
  ariaLabel: undefined,
})

const percent = computed<number>(() => {
  if (props.max <= 0) return 0
  const raw = (props.value / props.max) * 100
  return Math.min(100, Math.max(0, Math.round(raw)))
})

const clampedValue = computed<number>(() =>
  Math.min(Math.max(props.value, 0), Math.max(props.max, 0)),
)

const ariaMax = computed<number>(() => Math.max(props.max, 0))

const trackClass = computed<string>(() =>
  props.size === 'lg' ? 'h-6' : 'h-2.5',
)

/* Aplat : `accent-fill` (jamais une couleur Tailwind par défaut). */
const fillClass = computed<string>(() =>
  props.tone === 'ok' ? 'bg-ok-400' : 'bg-accent-fill',
)

/** Le pourcentage n'est superposé à la barre que si elle est assez haute. */
const percentInside = computed<boolean>(
  () => props.showPercent && props.size === 'lg',
)

const headerVisible = computed<boolean>(
  () =>
    props.label !== undefined ||
    (props.showPercent && !percentInside.value),
)

const accessibleName = computed<string>(
  () => props.ariaLabel ?? props.label ?? 'Progression',
)
</script>

<template>
  <div class="w-full">
    <div
      v-if="headerVisible"
      class="mb-1.5 flex items-center justify-between gap-2 text-xs"
    >
      <span v-if="label" class="min-w-0 truncate text-ink-300">{{ label }}</span>
      <span
        v-if="showPercent && !percentInside"
        class="tnum shrink-0 text-ink-500"
      >
        {{ percent }} %
      </span>
    </div>

    <div
      class="relative w-full overflow-hidden rounded-full bg-surface-600"
      :class="trackClass"
      role="progressbar"
      :aria-label="accessibleName"
      :aria-valuenow="clampedValue"
      aria-valuemin="0"
      :aria-valuemax="ariaMax"
      :aria-valuetext="`${percent} %`"
    >
      <div
        class="h-full rounded-full transition-[width] duration-[600ms] ease-[var(--ease-in-out)]"
        :class="fillClass"
        :style="{ width: `${percent}%` }"
      />
      <span
        v-if="percentInside"
        class="tnum absolute inset-y-0.5 right-1 flex items-center rounded-full bg-surface-950/70 px-1.5 text-xs font-semibold text-ink-100"
      >
        {{ percent }} %
      </span>
    </div>
  </div>
</template>
