<script setup lang="ts">
import UiCard from '~/components/ui/UiCard.vue'
import {
  MONTHS_LONG,
  WEEKDAYS_SHORT,
  addDays,
  formatLongDate,
  fromISODate,
  isSameDay,
  startOfWeek,
  toISODate,
} from '~/utils/dates'

const props = defineProps<{
  /** Date sélectionnée, format `YYYY-MM-DD`. */
  modelValue: string
  /** Dates `YYYY-MM-DD` contenant au moins une tâche (points sur le calendrier). */
  taskDates: string[]
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
  /** Intervalle visible (du lundi au dimanche des grilles affichées). */
  rangeChange: [from: string, to: string]
}>()

/** Mois affiché (toujours le 1er du mois, heure locale). */
const visibleMonth = ref<Date>(startOfMonth(fromISODate(props.modelValue)))
/** Jour ayant le focus clavier (tabindex 0). */
const focusedDate = ref<string>(props.modelValue)

const today = new Date()

/** Semaines [lun → dim] de la grille affichée. */
interface CalendarDay {
  iso: string
  date: Date
  inMonth: boolean
  isToday: boolean
  isSelected: boolean
  hasTasks: boolean
}

type CalendarWeek = CalendarDay[]

const taskDateSet = computed<Set<string>>(() => new Set(props.taskDates))

const weeks = computed<CalendarWeek[]>(() => {
  const firstOfMonth = new Date(
    visibleMonth.value.getFullYear(),
    visibleMonth.value.getMonth(),
    1,
  )
  const lastOfMonth = new Date(
    visibleMonth.value.getFullYear(),
    visibleMonth.value.getMonth() + 1,
    0,
  )
  const gridStart = startOfWeek(firstOfMonth)
  const gridEnd = addDays(startOfWeek(lastOfMonth), 6)

  const result: CalendarWeek[] = []
  let cursor = gridStart
  while (cursor.getTime() <= gridEnd.getTime()) {
    const week: CalendarWeek = []
    for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
      const date = cursor
      const iso = toISODate(date)
      week.push({
        iso,
        date,
        inMonth: date.getMonth() === visibleMonth.value.getMonth(),
        isToday: isSameDay(date, today),
        isSelected: iso === props.modelValue,
        hasTasks: taskDateSet.value.has(iso),
      })
      cursor = addDays(cursor, 1)
    }
    result.push(week)
  }
  return result
})

/** « Octobre 2026 » */
const monthLabel = computed<string>(() => {
  const name = MONTHS_LONG[visibleMonth.value.getMonth()] ?? ''
  const capitalized = name.charAt(0).toUpperCase() + name.slice(1)
  return `${capitalized} ${visibleMonth.value.getFullYear()}`
})

/** Jours de la semaine affichés, lundi en premier. */
const weekdayLabels: string[] = [1, 2, 3, 4, 5, 6, 0].map(
  (index) => WEEKDAYS_SHORT[index] ?? '',
)

const gridRef = ref<HTMLElement | null>(null)

// Synchronise le mois affiché quand la date sélectionnée change de mois
// (ex. raccourcis « Demain / Cette semaine / Plus tard »).
watch(
  () => props.modelValue,
  (value) => {
    const target = fromISODate(value)
    if (
      target.getMonth() !== visibleMonth.value.getMonth() ||
      target.getFullYear() !== visibleMonth.value.getFullYear()
    ) {
      visibleMonth.value = startOfMonth(target)
    }
  },
)

watch(visibleMonth, () => {
  emitVisibleRange()
})

onMounted(() => {
  emitVisibleRange()
})

function emitVisibleRange(): void {
  const firstOfMonth = new Date(
    visibleMonth.value.getFullYear(),
    visibleMonth.value.getMonth(),
    1,
  )
  const lastOfMonth = new Date(
    visibleMonth.value.getFullYear(),
    visibleMonth.value.getMonth() + 1,
    0,
  )
  emit('rangeChange', toISODate(startOfWeek(firstOfMonth)), toISODate(addDays(startOfWeek(lastOfMonth), 6)))
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

function goToMonth(delta: number): void {
  visibleMonth.value = new Date(
    visibleMonth.value.getFullYear(),
    visibleMonth.value.getMonth() + delta,
    1,
  )
}

function selectDay(iso: string): void {
  emit('update:modelValue', iso)
}

/** Focus clavier sur une date (roving tabindex). */
function focusDay(iso: string): void {
  focusedDate.value = iso
  const target = fromISODate(iso)
  // Si on sort du mois affiché, on suit avec la navigation mensuelle.
  if (target.getMonth() !== visibleMonth.value.getMonth() ||
      target.getFullYear() !== visibleMonth.value.getFullYear()) {
    visibleMonth.value = startOfMonth(target)
  }
  nextTick(() => {
    const el = gridRef.value?.querySelector<HTMLElement>(
      `[data-date="${iso}"]`,
    )
    el?.focus()
  })
}

function onGridKeydown(event: KeyboardEvent): void {
  const deltaBy: Record<string, number> = {
    ArrowLeft: -1,
    ArrowRight: 1,
    ArrowUp: -7,
    ArrowDown: 7,
  }
  const delta = deltaBy[event.key]
  if (delta !== undefined) {
    event.preventDefault()
    focusDay(toISODate(addDays(fromISODate(focusedDate.value), delta)))
    return
  }
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    selectDay(focusedDate.value)
  }
}
</script>

<template>
  <UiCard class="p-4">
    <div class="mb-3 flex items-center justify-between">
      <button
        type="button"
        aria-label="Mois précédent"
        class="rounded-md p-1.5 text-ink-300 transition-colors hover:bg-surface-800 hover:text-ink-100 focus-visible:outline-2 focus-visible:outline-accent-400"
        @click="goToMonth(-1)"
      >
        <span aria-hidden="true">‹</span>
      </button>
      <h2 class="text-sm font-medium text-ink-100">{{ monthLabel }}</h2>
      <button
        type="button"
        aria-label="Mois suivant"
        class="rounded-md p-1.5 text-ink-300 transition-colors hover:bg-surface-800 hover:text-ink-100 focus-visible:outline-2 focus-visible:outline-accent-400"
        @click="goToMonth(1)"
      >
        <span aria-hidden="true">›</span>
      </button>
    </div>

    <div
      ref="gridRef"
      role="grid"
      :aria-label="`Calendrier de ${monthLabel}`"
      class="select-none"
      @keydown="onGridKeydown"
    >
      <!-- En-tête des jours -->
      <div role="row" class="grid grid-cols-7 gap-1">
        <span
          v-for="label in weekdayLabels"
          :key="label"
          role="columnheader"
          class="py-1 text-center text-xs uppercase text-ink-500"
        >
          {{ label }}
        </span>
      </div>

      <div
        v-for="(week, weekIndex) in weeks"
        :key="weekIndex"
        role="row"
        class="grid grid-cols-7 gap-1"
      >
        <button
          v-for="day in week"
          :key="day.iso"
          type="button"
          role="gridcell"
          :data-date="day.iso"
          :tabindex="day.iso === focusedDate ? 0 : -1"
          :aria-label="formatLongDate(day.date)"
          :aria-selected="day.isSelected"
          :aria-current="day.isToday ? 'date' : undefined"
          class="relative flex h-9 items-center justify-center rounded-lg text-sm transition-colors focus-visible:outline-2 focus-visible:outline-accent-400"
          :class="[
            day.inMonth ? 'text-ink-100' : 'text-ink-500',
            day.isSelected ? 'bg-surface-700 font-medium' : 'hover:bg-surface-800',
            day.isToday ? 'text-accent-400 font-medium' : '',
          ]"
          @click="selectDay(day.iso)"
          @focus="focusedDate = day.iso"
        >
          {{ day.date.getDate() }}
          <span
            v-if="day.hasTasks"
            class="absolute bottom-1 h-1 w-1 rounded-full bg-accent-400"
            aria-hidden="true"
          />
        </button>
      </div>
    </div>
  </UiCard>
</template>
