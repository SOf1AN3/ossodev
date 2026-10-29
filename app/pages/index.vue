<script setup lang="ts">
import { useGamification, type BadgeWithEarnedAt } from '~/composables/useGamification'
import { useMoments } from '~/composables/useMoments'
import { useProjects, type ProjectWithCounts } from '~/composables/useProjects'
import { useTasks, type TaskWithOverdue } from '~/composables/useTasks'
import { useToast } from '~/composables/useToast'
import IdeaCapture from '~/components/dashboard/IdeaCapture.vue'
import JourWidget from '~/components/dashboard/JourWidget.vue'
import MissionSummary from '~/components/dashboard/MissionSummary.vue'
import ProjectCard from '~/components/dashboard/ProjectCard.vue'
import ScanStatus from '~/components/projects/ScanStatus.vue'
import UiButton from '~/components/ui/UiButton.vue'
import UiEmptyState from '~/components/ui/UiEmptyState.vue'
import UiIcon from '~/components/ui/UiIcon.vue'
import UiSkeleton from '~/components/ui/UiSkeleton.vue'
import { toISODate } from '~/utils/dates'

useHead({ title: 'OSSO — Tableau de bord' })

const { summary, badges, mission, error, load, refreshSummary } = useGamification()
const { listProjects } = useProjects()
const {
  today,
  pending: todayPending,
  error: todayError,
  loadToday,
  toggleDone,
} = useTasks()
const toast = useToast()
const { igniteBadge, flareFlame, sweepHero, countUp } = useMoments()

// — Projets dev : chargement indépendant de la gamification. —
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
  void loadToday()
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

/* ══════════════════════════════════════════════════════════════
   MOMENT ③ — la série : la flamme s'ouvre, le chiffre s'incrémente.
   ══════════════════════════════════════════════════════════════ */
const streakDisplay = ref(0)
const refFlamme = ref<HTMLElement | null>(null)

watch(
  () => summary.value?.streak ?? 0,
  (next, previous) => {
    if (previous === undefined) {
      streakDisplay.value = next
      return
    }
    if (next === previous) return
    flareFlame(refFlamme.value)
    countUp(streakDisplay, next)
  },
  { immediate: true },
)

/* ══════════════════════════════════════════════════════════════
   MOMENT ② — ignition des badges gagnés aujourd'hui.
   Le toast « badge débloqué » est émis par `useGamification` lui-même
   (le payload `newlyEarned` est consommé au chargement du résumé) :
   on n'en affiche jamais un second, on ne joue que l'embrasement.
   ══════════════════════════════════════════════════════════════ */
const badgesListEl = ref<HTMLElement | null>(null)
const todayIso = toISODate(new Date())
let badgesIgnited = false

function igniteTodayBadges(): void {
  const container = badgesListEl.value
  if (container === null) return
  const items = container.querySelectorAll<HTMLElement>('[data-badge-code]')
  for (const item of items) {
    const code = item.dataset.badgeCode
    if (code === undefined || code === '') continue
    const badge = badges.value.find((candidate) => candidate.code === code)
    if (badge === undefined || badge.earned_at === null) continue
    if (toISODate(new Date(badge.earned_at)) !== todayIso) continue
    igniteBadge(item)
  }
}

watch(
  () => summary.value !== null && badges.value.length > 0,
  async (ready) => {
    if (!ready || badgesIgnited) return
    badgesIgnited = true
    await nextTick()
    igniteTodayBadges()
  },
  { immediate: true },
)

/* ══════════════════════════════════════════════════════════════
   MOMENT ④ — journée bouclée : balayage de la bande héro, puis
   révélation de la ligne « Journée bouclée ».
   ══════════════════════════════════════════════════════════════ */
const refHeroBand = ref<HTMLElement | null>(null)
const boucleeVisible = ref(false)
let boucleePlayed = false
let boucleeTimer: number | null = null

function armBoucleeTimer(): void {
  boucleeTimer = window.setTimeout(() => {
    boucleeTimer = null
    boucleeVisible.value = true
  }, 500)
}

function resetBouclee(): void {
  if (boucleeTimer !== null) {
    window.clearTimeout(boucleeTimer)
    boucleeTimer = null
  }
  if (boucleeVisible.value) boucleeVisible.value = false
  boucleePlayed = false
}

onUnmounted(() => {
  if (boucleeTimer !== null) window.clearTimeout(boucleeTimer)
})

watch(
  summary,
  async (current) => {
    const complete =
      current !== null &&
      current.scheduledToday > 0 &&
      current.doneToday === current.scheduledToday
    if (!complete) {
      // Réversible : dévalider une tâche retire la ligne et réarme le moment.
      if (boucleePlayed) resetBouclee()
      return
    }
    if (boucleePlayed) return
    boucleePlayed = true
    if (!import.meta.client) return
    await nextTick()
    sweepHero(refHeroBand.value)
    armBoucleeTimer()
  },
  { immediate: true },
)

/* ══════════════════════════════════════════════════════════════
   Aperçu « Aujourd'hui » — 3 tâches, basculables (moment ①).
   ══════════════════════════════════════════════════════════════ */
const previewTasks = computed<TaskWithOverdue[]>(() =>
  [...today.value]
    .sort(
      (a, b) =>
        Number(a.status === 'done') - Number(b.status === 'done'),
    )
    .slice(0, 3),
)

const togglingId = ref<string | null>(null)
const popId = ref<string | null>(null)

async function onTogglePreview(task: TaskWithOverdue): Promise<void> {
  if (togglingId.value !== null) return
  togglingId.value = task.id
  const willValidate = task.status !== 'done'
  try {
    await toggleDone(task)
    if (willValidate) {
      toast.show({
        tone: 'success',
        title: 'Tâche validée',
        message: `« ${task.title} »`,
      })
      popId.value = task.id
      window.setTimeout(() => {
        popId.value = null
      }, 400)
    }
    await refreshSummary()
  } catch (err) {
    toast.show({
      tone: 'error',
      title: 'Mise à jour impossible',
      message: err instanceof Error ? err.message : 'Erreur inconnue.',
    })
  } finally {
    togglingId.value = null
  }
}

/* ══════════════════════════════════════════════════════════════
   Niveau — progressée depuis le basculement de niveau en cours.
   ══════════════════════════════════════════════════════════════ */
const pointsFormatter = new Intl.NumberFormat('fr-FR')

function formatPts(value: number): string {
  return pointsFormatter.format(value)
}

/** Progression dans le palier courant, 0 → 100. */
const levelPercent = computed<number>(() => {
  const current = summary.value
  if (current === null || current.level < 1 || current.nextLevelAt <= 0) {
    return 0
  }
  const perLevel = current.nextLevelAt / current.level
  if (perLevel <= 0) return 0
  const inLevel = current.points - (current.nextLevelAt - perLevel)
  return Math.max(0, Math.min(100, Math.round((inLevel / perLevel) * 100)))
})

const pointsToNextLevel = computed<number>(() => {
  const current = summary.value
  if (current === null) return 0
  return Math.max(0, current.nextLevelAt - current.points)
})
</script>

<template>
  <div class="flex flex-col">
    <!-- Erreur globale -->
    <UiEmptyState
      v-if="summary === null && error !== null"
      title="Impossible de charger le tableau de bord"
      :description="error"
      title-level="h1"
    >
      <template #action>
        <UiButton @click="load">Réessayer</UiButton>
      </template>
    </UiEmptyState>

    <!-- Chargement -->
    <div
      v-else-if="loading"
      class="flex flex-col"
      aria-busy="true"
      aria-label="Chargement du tableau de bord"
    >
      <div class="surface mb-8 px-8 py-7">
        <UiSkeleton class="h-24 w-full" />
      </div>
      <div class="grid grid-cols-1 gap-8 lg:grid-cols-12">
        <div class="flex flex-col gap-8 lg:col-span-8">
          <UiSkeleton class="h-32 w-full" />
          <UiSkeleton class="h-64 w-full" />
        </div>
        <div class="flex flex-col gap-8 lg:col-span-4">
          <UiSkeleton class="h-56 w-full" />
          <UiSkeleton class="h-40 w-full" />
          <UiSkeleton class="h-44 w-full" />
        </div>
      </div>
    </div>

    <!-- Contenu -->
    <template v-else-if="summary !== null">
      <!-- Erreur partielle (chargement incomplet) -->
      <div
        v-if="error !== null"
        class="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-sm border border-danger-400/40 bg-danger-400/10 px-4 py-3"
        role="alert"
      >
        <p class="text-sm text-danger-400">{{ error }}</p>
        <UiButton size="sm" variant="outline" @click="load">Réessayer</UiButton>
      </div>

      <!-- ═══ BANDE HÉRO COCKPIT ═══ -->
      <div ref="refHeroBand" class="hero surface mb-8 px-8 py-7">
        <div class="hero-sweep" aria-hidden="true" />

        <div
          class="relative flex flex-wrap items-center gap-x-9 gap-y-7"
        >
          <!-- ① + ② : métrique géante + arc d'instrument -->
          <JourWidget :summary="summary" />

          <span
            class="hidden self-stretch bg-line lg:block"
            style="width: 1px"
            aria-hidden="true"
          />

          <!-- ③ Série -->
          <div class="min-w-[130px]">
            <p class="flex items-center gap-1.5">
              <span ref="refFlamme" class="inline-flex">
                <UiIcon name="flame" class="h-5 w-5 text-accent-400" />
              </span>
              <span class="micro text-ink-700">Série</span>
            </p>
            <p class="mt-2 flex items-baseline gap-2">
              <span class="display display-lg tnum text-accent-400">
                {{ streakDisplay }}
              </span>
              <span class="text-[14px] text-ink-500">jours</span>
            </p>
            <p class="mt-2 text-[13px] text-ink-500">
              d’affilée sans rien rater
            </p>
          </div>

          <span
            class="hidden self-stretch bg-line lg:block"
            style="width: 1px"
            aria-hidden="true"
          />

          <!-- ④ Niveau -->
          <div class="min-w-[210px] flex-1">
            <div
              class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1"
            >
              <p class="micro text-ink-700">Niveau {{ summary.level }}</p>
              <p class="tnum font-mono text-[12px] text-ink-700">
                {{ formatPts(summary.points) }} /
                {{ formatPts(summary.nextLevelAt) }} pts
              </p>
            </div>
            <p class="mt-2 text-[17px] font-semibold text-ink-100">
              {{ summary.levelName }}
            </p>
            <div
              class="mt-3 h-[5px] w-full max-w-[280px] overflow-hidden rounded-full bg-surface-600"
              role="progressbar"
              :aria-valuenow="levelPercent"
              aria-valuemin="0"
              aria-valuemax="100"
              aria-label="Progression vers le niveau suivant"
            >
              <div
                class="h-full rounded-full bg-accent-fill"
                :style="{
                  width: `${levelPercent}%`,
                  transition: 'width 600ms var(--ease-in-out)',
                }"
              />
            </div>
            <p class="mt-2 text-[12px] text-ink-700">
              {{ formatPts(pointsToNextLevel) }} pts avant le prochain rang
            </p>
          </div>
        </div>

        <p
          id="bouclee"
          v-show="boucleeVisible"
          class="relative mt-6 border-t border-line pt-4 text-[13px] italic text-ink-500"
        >
          Journée bouclée. Reviens demain.
        </p>
      </div>

      <!-- ═══ GRILLE 8 / 4 ═══ -->
      <div class="grid grid-cols-1 gap-8 lg:grid-cols-12">
        <!-- Colonne gauche -->
        <section class="flex flex-col gap-8 lg:col-span-8">
          <!-- Projets dev -->
          <div class="flex flex-col gap-4">
            <div class="flex flex-wrap items-center justify-between gap-3">
              <h2
                class="text-[19px] font-semibold tracking-[-0.01em] text-ink-100"
              >
                Projets dev
              </h2>
              <NuxtLink
                to="/projets"
                class="text-[13px] text-accent-400 transition-colors hover:text-ink-100"
              >
                Tous les projets →
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
              class="flex flex-wrap items-center justify-between gap-3 rounded-sm border border-danger-400/40 bg-danger-400/10 px-4 py-3"
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
              title="Aucun projet détecté"
              description="Rescanne ton dossier dev."
            >
              <template #action>
                <NuxtLink
                  to="/projets"
                  class="btn inline-flex items-center gap-2 rounded-sm border border-line px-4 py-2 text-sm font-medium text-ink-100 transition-colors hover:bg-surface-800"
                >
                  Ouvrir l’espace projets
                </NuxtLink>
              </template>
            </UiEmptyState>

            <!-- Vide : tout est à jour -->
            <p
              v-else-if="visibleProjects.length === 0"
              class="surface px-4 py-6 text-center text-sm text-ink-300"
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
          </div>

          <!-- Aujourd'hui : c'est ce bloc qui équilibre la colonne -->
          <div class="flex flex-col gap-4">
            <div class="flex flex-wrap items-center justify-between gap-3">
              <h2
                class="text-[19px] font-semibold tracking-[-0.01em] text-ink-100"
              >
                Aujourd’hui
              </h2>
              <NuxtLink
                to="/aujourdhui"
                class="text-[13px] text-accent-400 transition-colors hover:text-ink-100"
              >
                Les 7 →
              </NuxtLink>
            </div>

            <!-- Chargement -->
            <div
              v-if="todayPending"
              class="surface flex flex-col gap-2 px-2 py-2"
              aria-busy="true"
              aria-label="Chargement des tâches du jour"
            >
              <UiSkeleton class="h-12 w-full" />
              <UiSkeleton class="h-12 w-full" />
              <UiSkeleton class="h-12 w-full" />
            </div>

            <!-- Erreur -->
            <div
              v-else-if="todayError !== null"
              class="surface flex flex-wrap items-center justify-between gap-3 px-4 py-3"
              role="alert"
            >
              <p class="text-sm text-danger-400">{{ todayError }}</p>
              <UiButton size="sm" variant="outline" @click="loadToday()">
                Réessayer
              </UiButton>
            </div>

            <!-- Vide -->
            <UiEmptyState
              v-else-if="today.length === 0"
              title="Rien de prévu aujourd’hui"
              description="Ajoute une tâche pour démarrer ta journée."
            >
              <template #action>
                <NuxtLink
                  to="/aujourdhui"
                  class="btn inline-flex items-center gap-2 rounded-sm border border-line px-4 py-2 text-sm font-medium text-ink-100 transition-colors hover:bg-surface-800"
                >
                  Ouvrir le plan du jour
                </NuxtLink>
              </template>
            </UiEmptyState>

            <!-- Aperçu : 3 tâches basculables (moment ①) -->
            <template v-else>
              <ul
                class="surface flex flex-col gap-1 p-2"
                aria-label="Aperçu des tâches du jour"
              >
                <li
                  v-for="task in previewTasks"
                  :key="task.id"
                  class="task relative rounded-xs"
                  :class="{
                    done: task.status === 'done',
                    pop: popId === task.id,
                  }"
                >
                  <button
                    type="button"
                    class="flex w-full items-center gap-3 rounded-xs px-2.5 py-2.5 text-left transition-colors hover:bg-surface-800 disabled:opacity-40"
                    :disabled="togglingId === task.id"
                    :aria-pressed="task.status === 'done'"
                    @click="onTogglePreview(task)"
                  >
                    <span class="box" aria-hidden="true">
                      <svg viewBox="0 0 24 24">
                        <path d="m5 12.6 4.6 4.6L19 7.4" />
                      </svg>
                    </span>
                    <span class="min-w-0 flex-1 truncate text-sm text-ink-300">
                      <span class="strike">{{ task.title }}</span>
                    </span>
                    <span class="micro tnum shrink-0 text-ink-700">
                      {{ task.points }} pts
                    </span>
                  </button>
                </li>
              </ul>

              <p
                v-if="today.length > previewTasks.length"
                class="text-[13px] text-ink-500"
              >
                + {{ today.length - previewTasks.length }} autres tâches —
                <NuxtLink
                  to="/aujourdhui"
                  class="text-accent-400 transition-colors hover:text-ink-100"
                >
                  tout voir
                </NuxtLink>
              </p>
            </template>
          </div>
        </section>

        <!-- Colonne droite -->
        <section class="flex flex-col gap-8 lg:col-span-4">
          <IdeaCapture />

          <MissionSummary
            :mission="mission?.mission ?? null"
            :progress="mission?.progress ?? 0"
            :is-completed="mission?.is_completed ?? false"
          />

          <!-- Derniers badges -->
          <div class="flex flex-col gap-4">
            <div class="flex flex-wrap items-center justify-between gap-3">
              <h2
                class="text-[19px] font-semibold tracking-[-0.01em] text-ink-100"
              >
                Derniers badges
              </h2>
              <NuxtLink
                to="/progres"
                class="text-[13px] text-accent-400 transition-colors hover:text-ink-100"
              >
                Voir tout
              </NuxtLink>
            </div>

            <ul
              v-if="recentBadges.length > 0"
              ref="badgesListEl"
              class="surface flex flex-col gap-1 p-2"
              aria-label="Derniers badges gagnés"
            >
              <li
                v-for="badge in recentBadges"
                :key="badge.code"
                :data-badge-code="badge.code"
                class="relative rounded-xs px-2.5 py-2.5 transition-colors hover:bg-surface-800"
              >
                <div class="flex items-center gap-3">
                  <span
                    class="grid h-9 w-9 flex-none place-items-center rounded-sm border border-line bg-surface-800 text-[17px]"
                    aria-hidden="true"
                  >
                    {{ badge.icon }}
                  </span>
                  <span class="min-w-0">
                    <span class="block truncate text-sm font-medium text-ink-100">
                      {{ badge.name }}
                    </span>
                    <span class="block truncate text-xs text-ink-500">
                      {{ badge.description }}
                    </span>
                  </span>
                </div>
                <!-- Braises du moment ② (visibles uniquement à l'embrasement) -->
                <span class="ember-particle" aria-hidden="true" />
                <span class="ember-particle" aria-hidden="true" />
                <span class="ember-particle" aria-hidden="true" />
              </li>
            </ul>

            <p
              v-else
              class="surface px-4 py-6 text-center text-sm text-ink-500"
            >
              Aucun badge débloqué pour l’instant.
            </p>
          </div>
        </section>
      </div>
    </template>
  </div>
</template>
