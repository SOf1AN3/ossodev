<script setup lang="ts">
import type { Mission } from '~~/shared/types'
import ProgressBar from '~/components/gamification/ProgressBar.vue'
import UiBadge from '~/components/ui/UiBadge.vue'
import UiIcon from '~/components/ui/UiIcon.vue'
import { formatShortDate, fromISODate } from '~/utils/dates'

// Mission de la semaine : titre, avancement `progress / target`,
// état « Réussie » (icône check) quand l'objectif est atteint.
interface MissionCardProps {
  mission: Mission | null
  progress: number
  isCompleted: boolean
}

defineProps<MissionCardProps>()

function weekLabel(weekStart: string): string {
  return `Semaine du ${formatShortDate(fromISODate(weekStart))}`
}
</script>

<template>
  <section class="surface px-5 py-4" aria-labelledby="mission-title">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div class="min-w-0">
        <p class="micro text-ink-700">Mission de la semaine</p>
        <h2
          v-if="mission"
          id="mission-title"
          class="mt-1.5 truncate text-[17px] font-semibold text-ink-100"
        >
          {{ mission.title }}
        </h2>
        <h2
          v-else
          id="mission-title"
          class="mt-1.5 text-[17px] font-semibold text-ink-100"
        >
          Aucune mission
        </h2>
      </div>

      <UiBadge v-if="mission !== null && isCompleted" tone="ok">
        <UiIcon name="check" size="sm" class="text-ok-400" />
        Réussie
      </UiBadge>
    </div>

    <template v-if="mission !== null">
      <ProgressBar
        class="mt-4"
        :value="progress"
        :max="mission.target"
        :label="`${progress} / ${mission.target} tâches`"
        show-percent
        :tone="isCompleted ? 'ok' : 'accent'"
      />

      <p class="mt-2.5 text-[12px] text-ink-500">
        {{ weekLabel(mission.week_start) }}
      </p>
    </template>

    <p v-else class="mt-3 text-sm text-ink-300">
      Définis une mission pour donner un cap à ta semaine depuis le tableau de
      bord.
    </p>
  </section>
</template>
