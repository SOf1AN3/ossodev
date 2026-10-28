<script setup lang="ts">
import type { Mission } from '~~/shared/types'
import ProgressBar from '~/components/gamification/ProgressBar.vue'
import UiBadge from '~/components/ui/UiBadge.vue'
import UiCard from '~/components/ui/UiCard.vue'
import { formatShortDate, fromISODate } from '~/utils/dates'

// Mission de la semaine : titre, avancement `progress / target`,
// état « ✅ Réussie » quand l'objectif est atteint.
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
  <UiCard>
    <template #header>
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="min-w-0">
          <p class="text-xs uppercase tracking-wide text-ink-500">
            Mission de la semaine
          </p>
          <h2
            v-if="mission"
            class="mt-1 truncate text-base font-medium text-ink-100"
          >
            {{ mission.title }}
          </h2>
          <h2 v-else class="mt-1 text-base font-medium text-ink-100">
            Aucune mission
          </h2>
        </div>

        <UiBadge v-if="mission && isCompleted" tone="ok">✅ Réussie</UiBadge>
      </div>
    </template>

    <template v-if="mission">
      <ProgressBar
        :value="progress"
        :max="mission.target"
        :label="`${progress} / ${mission.target} tâches`"
        show-percent
        :tone="isCompleted ? 'ok' : 'accent'"
      />

      <p class="mt-2 text-xs text-ink-500">{{ weekLabel(mission.week_start) }}</p>
    </template>

    <p v-else class="text-sm text-ink-300">
      Définis une mission pour donner un cap à ta semaine depuis le tableau de
      bord.
    </p>
  </UiCard>
</template>
