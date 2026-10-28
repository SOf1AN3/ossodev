<script setup lang="ts">
// Badge de série (streak) : flamme + nombre de jours consécutifs.
// Ton accentué si la série est en cours, neutre si elle est rompue.
interface StreakBadgeProps {
  streak: number
  size?: 'sm' | 'md' | 'lg'
}

const props = withDefaults(defineProps<StreakBadgeProps>(), {
  size: 'md',
})

const sizeClasses: Record<NonNullable<StreakBadgeProps['size']>, string> = {
  sm: 'gap-1 px-2 py-0.5 text-xs',
  md: 'gap-1.5 px-2.5 py-1 text-sm',
  lg: 'gap-2 px-3 py-1.5 text-base',
}

const toneClass = computed<string>(() =>
  props.streak > 0 ? 'text-accent-400' : 'text-ink-500',
)

const flameClass = computed<string>(() =>
  props.streak > 0 ? '' : 'opacity-50',
)

const text = computed<string>(() =>
  props.streak > 0
    ? `${props.streak} jour${props.streak > 1 ? 's' : ''} d’affilée`
    : 'Série à relancer',
)
</script>

<template>
  <span
    class="inline-flex items-center rounded-full border border-line bg-surface-900 font-medium"
    :class="[sizeClasses[size], toneClass]"
  >
    <span aria-hidden="true" :class="flameClass">🔥</span>
    <span>{{ text }}</span>
  </span>
</template>
