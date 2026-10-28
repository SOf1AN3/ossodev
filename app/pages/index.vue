<script setup lang="ts">
import { useGamification, type BadgeWithEarnedAt } from '~/composables/useGamification'
import { useProjects, type ProjectWithCounts } from '~/composables/useProjects'
import IdeaCapture from '~/components/dashboard/IdeaCapture.vue'
import JourWidget from '~/components/dashboard/JourWidget.vue'
import MissionSummary from '~/components/dashboard/MissionSummary.vue'
import ProjectCard from '~/components/dashboard/ProjectCard.vue'
import ScanStatus from '~/components/projects/ScanStatus.vue'
import UiButton from '~/components/ui/UiButton.vue'
import UiEmptyState from '~/components/ui/UiEmptyState.vue'
import UiSkeleton from '~/components/ui/UiSkeleton.vue'

useHead({ title: 'OSSO — Tableau de bord' })

const { summary, badges, mission, error, load } = useGamification()
const { listProjects } = useProjects()

// Projets dev : chargement indépendant de la gamification.
const projects = ref<ProjectWithCounts[]>([])
const projectsLoading = ref(true)
const projectsError = ref<string | null>(null)

const loading = computed<boolean>(
  () => summary.value === null && error.value === null,
)

/** Projets récents ayant des tâches ouvertes, 4 maximum. */
const visibleProjects = computed<ProjectWithCounts[]>(() =>
  [...projects.value]
    .filter((project) => project.open_tasks > 0)
    .sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    )
    .slice(0, 4),
)

/** 4 derniers badges gagnés, du plus récent au plus ancien. */
const recentBadges = computed<BadgeWithEarnedAt[]>(() =>
  badges.value
    .filter((badge) => badge.earned_at !== null)
    .sort((a, b) => {
      const left = a.earned_at ?? ''
      const right = b.earned_at ?? ''
      return right.localeCompare(left)
    })
    .slice(0, 4),
)

onMounted(() => {
  void load()
  void loadProjects()
})

async function loadProjects(): Promise<void> {
  projectsLoading.value = true
  projectsError.value = null
  try {
    projects.value = await listProjects()
  } catch (err) {
    projects.value = []
    projectsError.value =
      err instanceof Error && err.message
        ? err.message
        : 'Impossible de charger les projets.'
  } finally {
    projectsLoading.value = false
  }
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <header>
      <h1 class="text-2xl font-semibold text-ink-100">Tableau de bord</h1>
      <p class="mt-1 text-sm text-ink-300">
        Ta journée, tes idées et ton avancement en un coup d’œil.
      </p>
    </header>

    <!-- Erreur globale -->
    <UiEmptyState
      v-if="summary === null && error !== null"
      icon="⚠️"
      title="Impossible de charger le tableau de bord"
      :description="error"
    >
      <template #action>
        <UiButton @click="load">Réessayer</UiButton>
      </template>
    </UiEmptyState>

    <!-- Chargement -->
    <div
      v-else-if="loading"
      class="grid grid-cols-1 gap-6 md:grid-cols-12"
      aria-busy="true"
      aria-label="Chargement du tableau de bord"
    >
      <div class="md:col-span-7">
        <UiSkeleton class="h-64 w-full" />
      </div>
      <div class="md:col-span-5">
        <UiSkeleton class="h-64 w-full" />
      </div>
      <div class="md:col-span-5">
        <UiSkeleton class="h-48 w-full" />
      </div>
      <div class="md:col-span-7">
        <UiSkeleton class="h-48 w-full" />
      </div>
    </div>

    <!-- Contenu -->
    <template v-else-if="summary !== null">
      <!-- Erreur partielle (chargement incomplet) -->
      <div
        v-if="error !== null"
        class="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-danger-400/40 bg-danger-400/10 px-4 py-3"
        role="alert"
      >
        <p class="text-sm text-danger-400">{{ error }}</p>
        <UiButton size="sm" variant="outline" @click="load">Réessayer</UiButton>
      </div>

      <div class="grid grid-cols-1 gap-6 md:grid-cols-12">
        <!-- 1. Jour -->
        <JourWidget class="md:col-span-7" :summary="summary" />

        <!-- 2. Idées -->
        <IdeaCapture class="md:col-span-5" />

        <!-- 3. Mission -->
        <MissionSummary
          class="md:col-span-5"
          :mission="mission?.mission ?? null"
          :progress="mission?.progress ?? 0"
          :is-completed="mission?.is_completed ?? false"
        />

        <!-- 4. Projets dev -->
        <section
          class="flex flex-col gap-4 md:col-span-7"
          aria-labelledby="projets-title"
        >
          <div class="flex flex-wrap items-center justify-between gap-3">
            <h2 id="projets-title" class="text-base font-medium text-ink-100">
              Projets dev
            </h2>
            <NuxtLink
              to="/projets"
              class="rounded text-xs font-medium text-accent-400 transition-colors hover:text-ink-100 focus-visible:outline-2 focus-visible:outline-accent-400"
            >
              Tous les projets
            </NuxtLink>
          </div>

          <ScanStatus @scanned="loadProjects" />

          <!-- Chargement -->
          <div
            v-if="projectsLoading"
            class="flex flex-col gap-3"
            aria-busy="true"
            aria-label="Chargement des projets"
          >
            <UiSkeleton class="h-24 w-full" />
            <UiSkeleton class="h-24 w-full" />
          </div>

          <!-- Erreur -->
          <div
            v-else-if="projectsError !== null"
            class="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-danger-400/40 bg-danger-400/10 px-4 py-3"
            role="alert"
          >
            <p class="text-sm text-danger-400">{{ projectsError }}</p>
            <UiButton size="sm" variant="outline" @click="loadProjects">
              Réessayer
            </UiButton>
          </div>

          <!-- Vide : aucun projet -->
          <UiEmptyState
            v-else-if="projects.length === 0"
            icon="📁"
            title="Aucun projet détecté"
            description="Rescanne ton dossier dev."
          >
            <template #action>
              <NuxtLink
                to="/projets"
                class="rounded text-xs font-medium text-accent-400 transition-colors hover:text-ink-100 focus-visible:outline-2 focus-visible:outline-accent-400"
              >
                Ouvrir l’espace projets
              </NuxtLink>
            </template>
          </UiEmptyState>

          <!-- Vide : tout est à jour -->
          <p
            v-else-if="visibleProjects.length === 0"
            class="rounded-xl border border-line bg-surface-900 px-4 py-6 text-center text-sm text-ink-300"
          >
            Tous tes projets sont à jour.
          </p>

          <!-- Liste -->
          <div v-else class="flex flex-col gap-3">
            <ProjectCard
              v-for="project in visibleProjects"
              :key="project.id"
              :project="project"
            />
          </div>
        </section>

        <!-- 5. Badges récents -->
        <section
          class="flex flex-col gap-4 md:col-span-5"
          aria-labelledby="badges-recents-title"
        >
          <div class="flex flex-wrap items-center justify-between gap-3">
            <h2
              id="badges-recents-title"
              class="text-base font-medium text-ink-100"
            >
              Badges récents
            </h2>
            <NuxtLink
              to="/progres"
              class="rounded text-xs font-medium text-accent-400 transition-colors hover:text-ink-100 focus-visible:outline-2 focus-visible:outline-accent-400"
            >
              Voir tout
            </NuxtLink>
          </div>

          <ul
            v-if="recentBadges.length > 0"
            class="flex flex-col gap-3"
            aria-label="Derniers badges gagnés"
          >
            <li
              v-for="badge in recentBadges"
              :key="badge.code"
              class="flex items-center gap-3 rounded-xl border border-line bg-surface-800 px-4 py-3"
            >
              <span class="text-2xl" aria-hidden="true">{{ badge.icon }}</span>
              <span class="min-w-0">
                <span class="block truncate text-sm font-medium text-ink-100">
                  {{ badge.name }}
                </span>
                <span class="block truncate text-xs text-ink-500">
                  {{ badge.description }}
                </span>
              </span>
            </li>
          </ul>

          <p
            v-else
            class="rounded-xl border border-line bg-surface-900 px-4 py-6 text-center text-sm text-ink-300"
          >
            Aucun badge débloqué pour l’instant.
          </p>
        </section>
      </div>
    </template>
  </div>
</template>
