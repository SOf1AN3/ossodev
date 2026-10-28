<script setup lang="ts">
import { useGamification } from '~/composables/useGamification'
import BadgeGrid from '~/components/gamification/BadgeGrid.vue'
import LevelMeter from '~/components/gamification/LevelMeter.vue'
import MissionCard from '~/components/gamification/MissionCard.vue'
import RecordPanel from '~/components/gamification/RecordPanel.vue'
import StreakBadge from '~/components/gamification/StreakBadge.vue'
import UiButton from '~/components/ui/UiButton.vue'
import UiCard from '~/components/ui/UiCard.vue'
import UiEmptyState from '~/components/ui/UiEmptyState.vue'
import UiSkeleton from '~/components/ui/UiSkeleton.vue'

useHead({ title: 'Progrès — OSSO' })

const { summary, badges, records, mission, error, load } =
  useGamification()

const nf = new Intl.NumberFormat('fr-FR')

const loading = computed<boolean>(
  () => summary.value === null && error.value === null,
)

const totalPoints = computed<string>(() =>
  nf.format(summary.value?.points ?? 0),
)

const earnedCount = computed<number>(
  () => badges.value.filter((badge) => badge.earned_at !== null).length,
)

onMounted(() => {
  void load()
})
</script>

<template>
  <div class="flex flex-col gap-6">
    <header>
      <h1 class="text-2xl font-semibold text-ink-100">Progrès</h1>
      <p class="mt-1 text-sm text-ink-300">
        Ton niveau, tes badges et tes records personnels.
      </p>
    </header>

    <!-- Erreur globale -->
    <UiEmptyState
      v-if="summary === null && error !== null"
      icon="⚠️"
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
        class="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-danger-400/40 bg-danger-400/10 px-4 py-3"
        role="alert"
      >
        <p class="text-sm text-danger-400">{{ error }}</p>
        <UiButton size="sm" variant="outline" @click="load">Réessayer</UiButton>
      </div>

      <!-- En-tête : niveau + série + points -->
      <UiCard>
        <LevelMeter
          :level="summary.level"
          :level-name="summary.levelName"
          :points="summary.points"
          :next-level-at="summary.nextLevelAt"
        />

        <div
          class="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4"
        >
          <StreakBadge :streak="summary.streak" size="lg" />
          <p class="text-sm text-ink-300">
            <span class="font-semibold text-accent-400">{{ totalPoints }}</span>
            points au total
          </p>
        </div>
      </UiCard>

      <!-- Badges -->
      <section aria-labelledby="badges-title" class="flex flex-col gap-4">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <h2 id="badges-title" class="text-base font-medium text-ink-100">
            Badges
          </h2>
          <p class="text-xs text-ink-500">
            {{ earnedCount }} / {{ badges.length }} débloqués
          </p>
        </div>

        <BadgeGrid v-if="badges.length > 0" :badges="badges" />

        <UiEmptyState
          v-else
          icon="🏅"
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
        <h2 id="records-title" class="text-base font-medium text-ink-100">
          Records
        </h2>

        <UiCard v-if="records !== null">
          <RecordPanel :records="records" />
        </UiCard>

        <UiEmptyState
          v-else
          icon="📈"
          title="Pas encore de statistiques"
          description="Termine des tâches pour alimenter tes records."
        >
          <template #action>
            <NuxtLink
              to="/aujourdhui"
              class="rounded text-xs font-medium text-accent-400 transition-colors hover:text-ink-100 focus-visible:outline-2 focus-visible:outline-accent-400"
            >
              Voir mes tâches du jour
            </NuxtLink>
          </template>
        </UiEmptyState>
      </section>

      <!-- Bandeau -->
      <p class="rounded-xl border border-line bg-surface-900 px-4 py-3 text-xs text-ink-500">
        Ces statistiques ne comptent que tes tâches perso. Les projets dev ont
        leur propre espace.
      </p>
    </template>
  </div>
</template>
