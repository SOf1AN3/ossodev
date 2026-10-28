<script setup lang="ts">
import type { Records } from '~/composables/useGamification'
import { addDays, formatShortDate, fromISODate } from '~/utils/dates'

// Tableau sobre des records : valeurs alignées à droite, séparateurs fins.
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
      value: r.bestWeek ? bestWeekLabel(r.bestWeek.weekStart) : '—',
    },
    {
      label: 'Meilleur jour',
      value: r.bestDay ? bestDayLabel(r.bestDay.date) : '—',
    },
    { label: 'Tâches terminées', value: nf.format(r.totalTasks) },
    { label: 'Jours travaillés', value: nf.format(r.totalDaysWorked) },
    { label: 'Réussite sur 30 jours', value: `${completion} %` },
  ]
})
</script>

<template>
  <table class="w-full text-sm">
    <caption class="sr-only">
      Tes records et statistiques personnels
    </caption>
    <tbody>
      <tr
        v-for="row in rows"
        :key="row.label"
        class="border-b border-line last:border-0"
      >
        <th
          scope="row"
          class="py-3 pr-4 text-left font-normal text-ink-300"
        >
          {{ row.label }}
        </th>
        <td class="py-3 text-right font-medium tabular-nums text-ink-100">
          {{ row.value }}
        </td>
      </tr>
    </tbody>
  </table>
</template>
