<script setup lang="ts">
import type { Records } from '~/composables/useGamification'
import { addDays, formatShortDate, fromISODate } from '~/utils/dates'

// Tableau sobre des records : valeurs mono alignées à droite, filets fins,
// dates en français. Porte sa propre `.surface` (pas de carte parente).
interface RecordPanelProps {
  records: Records
}

const props = defineProps<RecordPanelProps>()

const nf = new Intl.NumberFormat('fr-FR')

interface RecordRow {
  label: string
  value: string
}

function bestWeekLabel(weekStart: string): string {
  const start = fromISODate(weekStart)
  const end = addDays(start, 6) // dimanche
  return `${formatShortDate(start)} → ${formatShortDate(end)}`
}

function bestDayLabel(iso: string): string {
  return formatShortDate(fromISODate(iso))
}

const rows = computed<RecordRow[]>(() => {
  const r = props.records
  const completion = Math.round(r.completionRate30 * 100)

  return [
    {
      label: 'Meilleure série',
      value: `${nf.format(r.bestStreak)} jour${r.bestStreak > 1 ? 's' : ''}`,
    },
    {
      label: 'Meilleure semaine',
      value: r.bestWeek !== null ? bestWeekLabel(r.bestWeek.weekStart) : '—',
    },
    {
      label: 'Meilleur jour',
      value: r.bestDay !== null ? bestDayLabel(r.bestDay.date) : '—',
    },
    { label: 'Tâches terminées', value: nf.format(r.totalTasks) },
    { label: 'Jours travaillés', value: nf.format(r.totalDaysWorked) },
    { label: 'Réussite sur 30 jours', value: `${nf.format(completion)} %` },
  ]
})
</script>

<template>
  <dl class="surface overflow-hidden">
    <div
      v-for="(row, index) in rows"
      :key="row.label"
      class="flex items-center justify-between gap-4 px-5 py-3.5"
      :class="index > 0 ? 'border-t border-line' : ''"
    >
      <dt class="text-[14px] text-ink-300">{{ row.label }}</dt>
      <dd class="tnum text-right font-mono text-[14px] font-bold text-ink-100">
        {{ row.value }}
      </dd>
    </div>
  </dl>
</template>
