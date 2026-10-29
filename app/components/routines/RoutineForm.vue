<script setup lang="ts">
import UiButton from '~/components/ui/UiButton.vue'
import UiInput from '~/components/ui/UiInput.vue'
import UiToggle from '~/components/ui/UiToggle.vue'
import WeekdayPicker from '~/components/routines/WeekdayPicker.vue'
import type { RoutineFrequency, RoutineInput } from '~~/shared/types'
import type { RoutineWithNext } from '~/composables/useRoutines'
import { toISODate } from '~/utils/dates'

const props = defineProps<{
  /** Routine à éditer, ou null pour la création. */
  routine: RoutineWithNext | null
  saving?: boolean
}>()

const emit = defineEmits<{
  save: [input: RoutineInput]
  cancel: []
}>()

const title = ref('')
const frequency = ref<RoutineFrequency>('weekly')
const weekdays = ref<number[]>([])
const points = ref('10')
const startDate = ref(toISODate(new Date()))
const isActive = ref(true)

watch(
  () => props.routine,
  (routine) => {
    if (routine) {
      title.value = routine.title
      frequency.value = routine.frequency
      weekdays.value = routine.weekdays ? [...routine.weekdays] : []
      points.value = String(routine.points)
      startDate.value = routine.start_date
      isActive.value = routine.is_active
    } else {
      title.value = ''
      frequency.value = 'weekly'
      weekdays.value = []
      points.value = '10'
      startDate.value = toISODate(new Date())
      isActive.value = true
    }
  },
  { immediate: true },
)

/** Validation alignée sur le serveur : une routine hebdo exige ≥ 1 jour. */
const weekdayError = computed<string | null>(() => {
  if (frequency.value !== 'weekly') return null
  return weekdays.value.length > 0
    ? null
    : 'Coche au moins un jour de la semaine.'
})

const canSave = computed<boolean>(
  () => title.value.trim().length > 0 && weekdayError.value === null,
)

function toggleFrequency(next: RoutineFrequency): void {
  frequency.value = next
  if (next === 'daily') weekdays.value = []
}

function onSubmit(): void {
  if (!canSave.value) return
  emit('save', {
    title: title.value.trim(),
    frequency: frequency.value,
    weekdays: frequency.value === 'weekly' ? [...weekdays.value] : null,
    points: Number.parseInt(points.value, 10) || 0,
    is_active: isActive.value,
    start_date: startDate.value,
  })
}
</script>

<template>
  <form class="flex flex-col gap-5" @submit.prevent="onSubmit">
    <UiInput v-model="title" label="Titre" placeholder="Titre de la routine" />

    <div class="flex flex-col gap-1.5">
      <span
        id="routine-frequency-label"
        class="micro text-ink-500"
      >
        Fréquence
      </span>
      <div
        role="group"
        aria-labelledby="routine-frequency-label"
        class="flex gap-2"
      >
        <button
          type="button"
          :aria-pressed="frequency === 'daily'"
          class="rounded-xs border px-3 py-1.5 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-accent-400"
          :class="
            frequency === 'daily'
              ? 'border-accent-fill bg-accent-fill text-[color:var(--color-on-accent)]'
              : 'border-line bg-surface-800 text-ink-500 hover:bg-surface-700 hover:text-ink-300'
          "
          @click="toggleFrequency('daily')"
        >
          Tous les jours
        </button>
        <button
          type="button"
          :aria-pressed="frequency === 'weekly'"
          class="rounded-xs border px-3 py-1.5 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-accent-400"
          :class="
            frequency === 'weekly'
              ? 'border-accent-fill bg-accent-fill text-[color:var(--color-on-accent)]'
              : 'border-line bg-surface-800 text-ink-500 hover:bg-surface-700 hover:text-ink-300'
          "
          @click="toggleFrequency('weekly')"
        >
          Jours précis
        </button>
      </div>
    </div>

    <div v-if="frequency === 'weekly'" class="flex flex-col gap-2">
      <span class="micro text-ink-500">Jours actifs</span>
      <WeekdayPicker v-model="weekdays" :disabled="saving" />
      <p v-if="weekdayError" class="text-xs text-danger-400" role="alert">
        {{ weekdayError }}
      </p>
    </div>

    <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <UiInput
        v-model="points"
        type="number"
        label="Points"
        placeholder="10"
      />
      <UiInput
        v-model="startDate"
        type="date"
        label="Date de début"
      />
    </div>

    <UiToggle v-model="isActive" label="Routine active" />

    <div class="flex justify-end gap-3 border-t border-line pt-4">
      <UiButton variant="ghost" :disabled="saving" @click="emit('cancel')">
        Annuler
      </UiButton>
      <UiButton type="submit" :disabled="!canSave" :loading="saving">
        Enregistrer
      </UiButton>
    </div>
  </form>
</template>
