<script setup lang="ts">
import type { BadgeWithEarnedAt } from '~/composables/useGamification'
import { useGamification } from '~/composables/useGamification'
import { useMoments } from '~/composables/useMoments'
import BadgeGrid from '~/components/gamification/BadgeGrid.vue'
import MissionCard from '~/components/gamification/MissionCard.vue'
import RecordPanel from '~/components/gamification/RecordPanel.vue'
import UiButton from '~/components/ui/UiButton.vue'
import UiEmptyState from '~/components/ui/UiEmptyState.vue'
import UiSkeleton from '~/components/ui/UiSkeleton.vue'

useHead({ title: 'Progrès — OSSO' })

const { summary, badges, records, mission, error, load, newlyEarned } =
  useGamification()
const { countUp } = useMoments()

const nf = new Intl.NumberFormat('fr-FR')

const loading = computed<boolean>(
  () => summary.value === null && error.value === null,
)

const earnedCount = computed<number>(
  () => badges.value.filter((badge) => badge.earned_at !== null).length,
)

const daysWorked = computed<number>(() => records.value?.totalDaysWorked ?? 0)

const daysWorkedLabel = computed<string>(() =>
  daysWorked.value > 1 ? 'jours actifs' : 'jour actif',
)

/* — Bande de chiffres : compteurs animés à l'arrivée du résumé (450 ms,
   neutralisés en « peu de mouvement » par `countUp`). — */
const levelCount = ref(0)
const pointsCount = ref(0)
const bestStreakCount = ref(0)

watch(
  summary,
  (stats) => {
    if (stats === null) return
    countUp(levelCount, stats.level)
    countUp(pointsCount, stats.points)
    countUp(bestStreakCount, stats.bestStreak)
  },
  { immediate: true },
)

/* — Bloc « Vers niveau N » — */
const nextLevelNumber = computed<number>(() => (summary.value?.level ?? 0) + 1)

const pointsToNext = computed<number>(() => {
  const stats = summary.value
  if (stats === null) return 0
  return Math.max(0, stats.nextLevelAt - stats.points)
})

const nextPercent = computed<number>(() => {
  const stats = summary.value
  if (stats === null) return 0
  if (stats.nextLevelAt <= 0) return 100
  return Math.min(100, Math.round((stats.points / stats.nextLevelAt) * 100))
})

/* — Moment ② : on lit `newlyEarned`, exposé par `useGamification`.
   Une heuristique sur `earned_at` (< 30 min) aurait embrasé un badge gagné
   dans une session précédente à chaque ouverture — une fausse célébration.
   `useGamification` toaste déjà : on ne pilote que l'animation. — */
const ignitionCode = computed<string | null>(() => {
  const earned = newlyEarned.value
  return earned.length > 0 ? (earned[0]?.code ?? null) : null
})

onMounted(() => {
  void load()
})
</script>

<template>
  <div class="flex flex-col gap-6">
    <header class="flex flex-col gap-5">
      <div>
        <p class="micro text-ink-700">
          Régularité · <span class="tnum">{{ daysWorked }}</span>
          {{ daysWorkedLabel }}
        </p>
        <h1
          class="mt-2 text-[30px] font-bold tracking-[-0.03em] text-ink-100"
        >
          Progrès
        </h1>
      </div>

      <!-- Bande de chiffres -->
      <div
        v-if="summary !== null"
        class="surface flex flex-wrap items-center gap-x-12 gap-y-6 px-8 py-6"
      >
        <!-- Niveau -->
        <div class="flex min-w-0 flex-col gap-2">
          <span class="micro text-ink-700">Niveau</span>
          <span class="tnum display display-lg text-ink-100">
            {{ levelCount }}
          </span>
          <span class="text-[14px] font-medium text-accent-400">
            {{ summary.levelName }}
          </span>
        </div>

        <span
          class="hidden h-14 w-px self-stretch bg-line lg:block"
          aria-hidden="true"
        ></span>

        <!-- Points -->
        <div class="flex min-w-0 flex-col gap-2">
          <span class="micro text-ink-700">Points</span>
          <span class="tnum display display-lg text-ink-100">
            {{ nf.format(pointsCount) }}
          </span>
        </div>

        <span
          class="hidden h-14 w-px self-stretch bg-line lg:block"
          aria-hidden="true"
        ></span>

        <!-- Meilleure série -->
        <div class="flex min-w-0 flex-col gap-2">
          <span class="micro text-ink-700">Meilleure série</span>
          <span class="tnum display display-lg text-accent-400">
            {{ bestStreakCount }}
          </span>
        </div>

        <span
          class="hidden h-14 w-px self-stretch bg-line lg:block"
          aria-hidden="true"
        ></span>

        <!-- Vers niveau N -->
        <div class="flex min-w-[220px] flex-1 flex-col gap-2.5">
          <div class="flex items-baseline justify-between gap-4">
            <span class="micro text-ink-700">
              Vers niveau {{ nextLevelNumber }}
            </span>
            <span class="tnum font-mono text-[12px] text-ink-700">
              {{ nf.format(summary.points) }} / {{ nf.format(summary.nextLevelAt) }}
            </span>
          </div>
          <div
            class="h-[5px] overflow-hidden rounded-full bg-surface-600"
            role="progressbar"
            :aria-valuenow="nextPercent"
            aria-valuemin="0"
            aria-valuemax="100"
            :aria-valuetext="`${nf.format(pointsToNext)} pts restants`"
            :aria-label="`Progression vers le niveau ${nextLevelNumber}`"
          >
            <div
              class="h-full rounded-full bg-accent-fill transition-[width] duration-[600ms] ease-[var(--ease-in-out)]"
              :style="{ width: `${nextPercent}%` }"
            ></div>
          </div>
          <span class="tnum font-mono text-[12px] text-ink-700">
            {{ nf.format(pointsToNext) }} pts restants
          </span>
        </div>
      </div>
    </header>

    <!-- Erreur globale -->
    <UiEmptyState
      v-if="summary === null && error !== null"
      title="Impossible de charger tes statistiques"
      :description="error"
    >
      <template #action>
        <UiButton @click="load">Réessayer</UiButton>
      </template>
    </UiEmptyState>

    <!-- Chargement -->
    <div
      v-else-if="loading"
      class="flex flex-col gap-4"
      aria-busy="true"
      aria-label="Chargement des statistiques"
    >
      <UiSkeleton class="h-32 w-full" />
      <UiSkeleton class="h-64 w-full" />
      <UiSkeleton class="h-48 w-full" />
    </div>

    <!-- Contenu -->
    <template v-else-if="summary !== null">
      <!-- Erreur partielle -->
      <div
        v-if="error !== null"
        class="flex flex-wrap items-center justify-between gap-3 rounded-sm border border-danger-400/40 bg-danger-400/10 px-4 py-3"
        role="alert"
      >
        <p class="text-sm text-danger-400">{{ error }}</p>
        <UiButton size="sm" variant="outline" @click="load">Réessayer</UiButton>
      </div>

      <!-- Badges -->
      <section aria-labelledby="badges-title" class="flex flex-col gap-4">
        <h2 id="badges-title" class="micro text-ink-700">
          Badges — <span class="tnum">{{ earnedCount }}</span> débloqués sur
          <span class="tnum">{{ badges.length }}</span>
        </h2>

        <BadgeGrid
          v-if="badges.length > 0"
          :badges="badges"
          :ignition-code="ignitionCode"
        />

        <UiEmptyState
          v-else
          title="Aucun badge disponible"
          description="Reviens un peu plus tard, le catalogue se remplit vite."
        />
      </section>

      <!-- Mission de la semaine -->
      <MissionCard
        :mission="mission?.mission ?? null"
        :progress="mission?.progress ?? 0"
        :is-completed="mission?.is_completed ?? false"
      />

      <!-- Records -->
      <section aria-labelledby="records-title" class="flex flex-col gap-4">
        <h2 id="records-title" class="micro text-ink-700">Records</h2>

        <RecordPanel v-if="records !== null" :records="records" />

        <UiEmptyState
          v-else
          title="Pas encore de statistiques"
          description="Termine des tâches pour alimenter tes records."
        >
          <template #action>
            <NuxtLink
              to="/aujourdhui"
              class="rounded-xs text-xs font-medium text-accent-400 transition-colors hover:text-ink-100"
            >
              Voir mes tâches du jour
            </NuxtLink>
          </template>
        </UiEmptyState>
      </section>

      <!-- Bandeau -->
      <p class="text-[13px] text-ink-500">
        Ces statistiques ne comptent que tes tâches perso. Les projets dev ont
        leur propre espace.
      </p>
    </template>
  </div>
</template>
