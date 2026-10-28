<script setup lang="ts">
import type { GamificationSummary } from '~~/shared/types'
import LevelMeter from '~/components/gamification/LevelMeter.vue'
import ProgressBar from '~/components/gamification/ProgressBar.vue'
import StreakBadge from '~/components/gamification/StreakBadge.vue'
import UiButton from '~/components/ui/UiButton.vue'
import UiCard from '~/components/ui/UiCard.vue'
import { formatLongDate } from '~/utils/dates'

// Pièce maîtresse du tableau de bord : date du jour, avancement quotidien,
// série en cours, niveau, et accès rapide aux tâches du jour.
interface JourWidgetProps {
  summary: GamificationSummary
}

defineProps<JourWidgetProps>()

const longDate = formatLongDate(new Date())

function goToToday(): void {
  void navigateTo('/aujourdhui')
}
</script>

<template>
  <UiCard>
    <template #header>
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div class="min-w-0">
          <p class="text-xs uppercase tracking-wide text-ink-500">
            Aujourd’hui
          </p>
          <h2 class="mt-1 text-lg font-medium text-ink-100">{{ longDate }}</h2>
        </div>

        <StreakBadge :streak="summary.streak" />
      </div>
    </template>

    <!-- Avancement de la journée -->
    <ProgressBar
      v-if="summary.scheduledToday > 0"
      size="lg"
      show-percent
      :value="summary.doneToday"
      :max="summary.scheduledToday"
      :label="`${summary.doneToday} / ${summary.scheduledToday} tâches`"
    />
    <p
      v-else
      class="rounded-lg border border-line bg-surface-800 px-4 py-3 text-sm text-ink-300"
    >
      Rien de prévu aujourd’hui.
    </p>

    <!-- Niveau & points -->
    <div class="mt-5">
      <LevelMeter
        :level="summary.level"
        :level-name="summary.levelName"
        :points="summary.points"
        :next-level-at="summary.nextLevelAt"
      />
    </div>

    <!-- Action principale -->
    <UiButton class="mt-5 w-full" @click="goToToday">
      Voir mes tâches du jour
    </UiButton>
  </UiCard>
</template>
