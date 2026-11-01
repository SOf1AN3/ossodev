<script setup lang="ts">
import type { LearningCourseSummary } from '~~/shared/types'
import { useLearning } from '~/composables/useLearning'
import { useToast } from '~/composables/useToast'
import { apiFetch } from '~/composables/useApi'
import UiBadge from '~/components/ui/UiBadge.vue'
import UiButton from '~/components/ui/UiButton.vue'
import UiEmptyState from '~/components/ui/UiEmptyState.vue'
import UiIcon from '~/components/ui/UiIcon.vue'
import UiModal from '~/components/ui/UiModal.vue'
import UiSkeleton from '~/components/ui/UiSkeleton.vue'

useHead({ title: 'Apprentissage — OSSO' })

const { list } = useLearning()
const toast = useToast()

/**
 * `last_reviewed_at` n'est pas encore sur `LearningCourseSummary` (contrat
 * figé : seul `CourseWithProjects` le porte) — lecture optionnelle défensive,
 * sans `as`, compatible avec les deux états du contrat.
 */
type ReviewedCourse = LearningCourseSummary & { last_reviewed_at?: string | null }

const courses = ref<ReviewedCourse[]>([])
const loading = ref(true)
const loadError = ref<string | null>(null)

const doneCount = computed<number>(
  () => courses.value.filter((course) => course.status === 'done').length,
)

const totalCount = computed<number>(() => courses.value.length)

const progressPercent = computed<number>(() => {
  if (totalCount.value === 0) return 0
  return Math.round((doneCount.value / totalCount.value) * 100)
})

async function load(): Promise<void> {
  loading.value = true
  loadError.value = null
  try {
    courses.value = await list()
  } catch (err) {
    courses.value = []
    loadError.value = err instanceof Error ? err.message : 'Impossible de charger les cours.'
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  void load()
})

// ─── Dernière révision ───────────────────────────────────────────────────────

const REVIEW_DATE_FORMAT = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

/** « Revu le 30 octobre 2026 » / « Jamais revu » — date en français. */
function reviewLabel(iso: string | null | undefined): string {
  if (iso == null) return 'Jamais revu'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return 'Jamais revu'
  return `Revu le ${REVIEW_DATE_FORMAT.format(date)}`
}

/** « il y a 2 h » / « hier » — Intl.RelativeTimeFormat en français. */
function formatRelative(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return 'date inconnue'
  const rtf = new Intl.RelativeTimeFormat('fr-FR', { numeric: 'auto' })
  const diffMinutes = Math.round((date.getTime() - Date.now()) / 60000)
  if (Math.abs(diffMinutes) < 60) {
    return rtf.format(diffMinutes, 'minute')
  }
  const diffHours = Math.round(diffMinutes / 60)
  if (Math.abs(diffHours) < 24) {
    return rtf.format(diffHours, 'hour')
  }
  return rtf.format(Math.round(diffHours / 24), 'day')
}

// ─── Suppression d'un cours (confirmation en modale, jamais `confirm()`) ─────

const deleteTarget = ref<LearningCourseSummary | null>(null)
const deleting = ref(false)

const deleteModalTitle = computed<string>(() =>
  deleteTarget.value === null
    ? 'Supprimer le cours'
    : `Supprimer « ${deleteTarget.value.title} » ?`,
)

function askDelete(course: LearningCourseSummary): void {
  deleteTarget.value = course
}

function cancelDelete(): void {
  if (deleting.value) return
  deleteTarget.value = null
}

async function confirmDelete(): Promise<void> {
  const target = deleteTarget.value
  if (target === null || deleting.value) return
  deleting.value = true
  try {
    await apiFetch<{ id: string }>(`/api/learning/${encodeURIComponent(target.technology)}`, {
      method: 'DELETE',
    })
    courses.value = courses.value.filter((course) => course.technology !== target.technology)
    deleteTarget.value = null
    toast.show({
      tone: 'success',
      title: 'Cours supprimé',
      message: `« ${target.title} » a été retiré de la bibliothèque.`,
    })
  } catch (err) {
    toast.show({
      tone: 'error',
      title: 'Suppression impossible',
      message: err instanceof Error ? err.message : 'Erreur inconnue.',
    })
  } finally {
    deleting.value = false
  }
}
</script>

<template>
  <div class="page-enter flex flex-col gap-6">
    <header class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p class="micro text-ink-700">Bibliothèque</p>
        <h1 class="mt-1 text-2xl font-semibold text-ink-100">Apprentissage</h1>
        <p class="mt-1 text-sm text-ink-500">
          Les cours générés par l'agent teacher, prêts à lire.
        </p>
      </div>

      <!-- Jauge de progression -->
      <div
        v-if="!loading && loadError === null && totalCount > 0"
        class="surface min-w-56 px-4 py-3"
      >
        <div class="flex items-baseline justify-between gap-4">
          <span class="micro text-ink-700">Progression</span>
          <span class="text-sm font-semibold text-ink-100 tnum">
            {{ doneCount }} / {{ totalCount }}
            <span class="font-normal text-ink-500">accomplis</span>
          </span>
        </div>
        <div
          class="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface-600"
          role="progressbar"
          :aria-valuenow="doneCount"
          aria-valuemin="0"
          :aria-valuemax="totalCount"
          aria-label="Progression de l'apprentissage"
        >
          <div
            class="h-full rounded-full bg-accent-fill transition-all"
            :style="{ width: `${progressPercent}%` }"
          />
        </div>
      </div>
    </header>

    <!-- Chargement -->
    <div
      v-if="loading"
      class="grid grid-cols-1 gap-4 md:grid-cols-2"
      aria-busy="true"
      aria-label="Chargement des cours"
    >
      <div v-for="n in 4" :key="n" class="surface flex flex-col gap-3 px-5 py-4" aria-hidden="true">
        <UiSkeleton class="h-5 w-2/3" />
        <UiSkeleton class="h-3 w-1/3" />
        <UiSkeleton class="h-3 w-1/2" />
      </div>
    </div>

    <!-- Erreur -->
    <UiEmptyState
      v-else-if="loadError !== null"
      title="Impossible de charger les cours"
      :description="loadError"
    >
      <template #action>
        <UiButton @click="load">Réessayer</UiButton>
      </template>
    </UiEmptyState>

    <!-- Vide -->
    <UiEmptyState
      v-else-if="totalCount === 0"
      title="Aucun cours"
      description="Ouvre un projet et lance l'agent teacher pour générer tes premiers cours."
    />

    <!-- Liste (inline : le composant CourseList n'offre ni badge de révision ni suppression) -->
    <ul v-else class="grid grid-cols-1 gap-4 md:grid-cols-2">
      <li v-for="course in courses" :key="course.technology" class="group relative h-full">
        <NuxtLink
          :to="`/apprentissage/${course.technology}`"
          class="surface lift flex h-full flex-col gap-3 px-5 py-4 pr-11 focus-visible:outline-2 focus-visible:outline-accent-400"
        >
          <div class="flex items-start justify-between gap-3">
            <h2
              class="min-w-0 font-semibold text-ink-100 transition-colors group-hover:text-accent-400"
              :title="course.title"
            >
              {{ course.title }}
            </h2>
            <UiBadge class="shrink-0" :tone="course.status === 'done' ? 'ok' : 'neutral'">
              {{ course.status === 'done' ? 'Accompli' : 'À lire' }}
            </UiBadge>
          </div>

          <p class="truncate font-mono text-[12px] text-ink-700" :title="course.technology">
            {{ course.technology }}
          </p>

          <UiBadge class="self-start" :tone="course.last_reviewed_at ? 'accent' : 'neutral'">
            {{ reviewLabel(course.last_reviewed_at) }}
          </UiBadge>

          <p class="micro mt-auto text-ink-700">
            Mis à jour · {{ formatRelative(course.updated_at) }}
          </p>
        </NuxtLink>

        <!-- Suppression : bouton hors du lien pour ne jamais naviguer en cliquant -->
        <button
          type="button"
          class="absolute right-2 top-2 z-10 rounded-xs p-1.5 text-ink-500 opacity-0 transition-opacity hover:bg-surface-800 hover:text-danger-400 focus-visible:opacity-100 group-hover:opacity-100"
          :aria-label="`Supprimer le cours ${course.title}`"
          title="Supprimer le cours"
          @click="askDelete(course)"
        >
          <UiIcon name="trash" size="sm" />
        </button>
      </li>
    </ul>

    <!-- Confirmation de suppression : modale, jamais `confirm()` natif -->
    <UiModal
      :open="deleteTarget !== null"
      :title="deleteModalTitle"
      size="sm"
      @close="cancelDelete"
    >
      <p class="text-sm text-ink-300">
        Le contenu Markdown de ce cours sera
        <strong class="text-ink-100">définitivement effacé</strong>. Cette action est irréversible.
      </p>
      <template #footer>
        <UiButton variant="ghost" :disabled="deleting" @click="cancelDelete">Annuler</UiButton>
        <UiButton variant="danger" :loading="deleting" @click="confirmDelete">
          Supprimer définitivement
        </UiButton>
      </template>
    </UiModal>
  </div>
</template>
