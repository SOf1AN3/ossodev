<script setup lang="ts">
import { WEEKDAYS_SHORT } from '~/utils/dates'

const props = defineProps<{
  /** Jours cochés (0 = dimanche). */
  modelValue: number[]
  /** Désactive les boutons (ex. fréquence « quotidienne »). */
  disabled?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: number[]]
}>()

/** Ordre lundi → dimanche. */
const orderedDays: number[] = [1, 2, 3, 4, 5, 6, 0]

function labelFor(day: number): string {
  return WEEKDAYS_SHORT[day] ?? ''
}

function isChecked(day: number): boolean {
  return props.modelValue.includes(day)
}

function toggle(day: number): void {
  if (props.disabled) return
  const next = isChecked(day)
    ? props.modelValue.filter((value) => value !== day)
    : [...props.modelValue, day]
  emit('update:modelValue', next)
}
</script>

<template>
  <div
    role="group"
    aria-label="Jours de la semaine"
    class="flex flex-wrap gap-2"
  >
    <button
      v-for="day in orderedDays"
      :key="day"
      type="button"
      :disabled="disabled"
      :aria-pressed="isChecked(day)"
      :aria-label="labelFor(day)"
      class="flex h-10 w-10 items-center justify-center rounded-xs border text-xs transition-colors focus-visible:outline-2 focus-visible:outline-accent-400 disabled:opacity-40"
      :class="
        isChecked(day)
          ? 'border-accent-400 bg-accent-400 text-[color:var(--color-on-accent)]'
          : 'border-line bg-surface-800 text-ink-500 hover:bg-surface-700 hover:text-ink-300'
      "
      @click="toggle(day)"
    >
      {{ labelFor(day) }}
    </button>
  </div>
</template>
