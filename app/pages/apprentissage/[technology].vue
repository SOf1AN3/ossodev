<script setup lang="ts">
import type { CourseHeading } from '~/composables/useMarkdown'
import { LearningApiError, useLearning } from '~/composables/useLearning'
import { useToast } from '~/composables/useToast'
import { apiFetch } from '~/composables/useApi'
import type { CourseWithProjects, LearningCourse } from '~~/shared/types'
import CourseBody from '~/components/learning/CourseBody.vue'
import CourseToc from '~/components/learning/CourseToc.vue'
import StatusButton from '~/components/learning/StatusButton.vue'
import UiButton from '~/components/ui/UiButton.vue'
import UiEmptyState from '~/components/ui/UiEmptyState.vue'
import UiIcon from '~/components/ui/UiIcon.vue'
import UiSkeleton from '~/components/ui/UiSkeleton.vue'

const route = useRoute()
const toast = useToast()
const { get, setStatus, pending, error, current } = useLearning()

// `params.technology` peut être string | string[] selon le routage
const slug = computed<string>(() => {
  const raw = route.params.technology
  return Array.isArray(raw) ? (raw[0] ?? '') : (raw ?? '')
})

const loading = ref(true)
const notFound = ref(false)
const headings = ref<CourseHeading[]>([])
const busy = ref(false)

type LinkedProject = CourseWithProjects['projects'][number]

/** Projets liés renvoyés par GET /api/learning/:technology (contrat partagé). */
const linkedProjects = ref<LinkedProject[]>([])

useHead({
  title: computed(() => `${current.value?.title ?? 'Cours'} — OSSO`),
})

const statusLabel = computed<string>(() =>
  current.value?.status === 'done' ? 'Accompli' : 'À lire',
)

function isLinkedProject(value: unknown): value is LinkedProject {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    'name' in value &&
    'folder_path' in value &&
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    typeof value.folder_path === 'string'
  )
}

/**
 * Le serveur enrichit le cours de ses projets liés ; `useLearning` n'expose
 * que `LearningCourse` — lecture défensive du champ supplémentaire.
 */
function readLinkedProjects(course: LearningCourse | null): LinkedProject[] {
  if (course === null || !('projects' in course)) return []
  const raw: unknown = course.projects
  if (!Array.isArray(raw)) return []
  return raw.filter(isLinkedProject)
}

/**
 * Pose `last_reviewed_at` à l'ouverture du cours — best-effort : un échec
 * d'horodatage ne doit jamais casser la lecture (échec silencieux).
 */
async function markReviewed(technology: string): Promise<void> {
  try {
    await apiFetch(`/api/learning/${encodeURIComponent(technology)}/review`, { method: 'POST' })
  } catch {
    // Silencieux assumé : la lecture reste prioritaire sur l'horodatage.
  }
}

async function load(): Promise<void> {
  loading.value = true
  notFound.value = false
  headings.value = []
  linkedProjects.value = []
  try {
    const loaded = await get(slug.value)
    linkedProjects.value = readLinkedProjects(loaded)
    void markReviewed(loaded.technology)
  } catch (err) {
    current.value = null
    notFound.value = err instanceof LearningApiError && err.status === 404
    // Le message FR lisible reste exposé par `error` du composable.
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  void load()
})

// Navigation entre deux cours sans recharger la page.
watch(slug, () => {
  void load()
})

async function onFinish(): Promise<void> {
  const course = current.value
  if (course === null || busy.value) return
  busy.value = true
  try {
    await setStatus(slug.value, 'done')
    toast.show({
      tone: 'success',
      title: 'Cours accompli',
      message: `« ${course.title} » est marqué comme lu.`,
    })
  } catch (err) {
    toast.show({
      tone: 'error',
      title: 'Changement de statut impossible',
      message: err instanceof Error ? err.message : 'Erreur inconnue.',
    })
  } finally {
    busy.value = false
  }
}

async function onReset(): Promise<void> {
  const course = current.value
  if (course === null || busy.value) return
  busy.value = true
  try {
    await setStatus(slug.value, 'todo')
    toast.show({
      tone: 'info',
      title: 'Cours remis à lire',
      message: `« ${course.title} » est de nouveau en liste de lecture.`,
    })
  } catch (err) {
    toast.show({
      tone: 'error',
      title: 'Changement de statut impossible',
      message: err instanceof Error ? err.message : 'Erreur inconnue.',
    })
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="page-enter flex flex-col gap-6">
    <!-- Chargement -->
    <template v-if="loading">
      <div class="flex flex-col gap-3" aria-busy="true">
        <UiSkeleton class="h-3 w-48" />
        <UiSkeleton class="h-8 w-2/3" />
      </div>
      <div class="surface flex flex-col gap-4 px-6 py-5" aria-hidden="true">
        <UiSkeleton class="h-4 w-full" />
        <UiSkeleton class="h-4 w-5/6" />
        <UiSkeleton class="h-40 w-full" />
        <UiSkeleton class="h-4 w-4/6" />
      </div>
    </template>

    <!-- 404 -->
    <UiEmptyState
      v-else-if="notFound"
      title="Cours introuvable"
      title-level="h1"
      description="Ce cours n'existe pas ou a été supprimé."
    >
      <template #action>
        <NuxtLink
          to="/apprentissage"
          class="btn inline-flex items-center gap-2 rounded-sm border border-line px-4 py-2 text-sm text-ink-100 transition-colors hover:bg-surface-800"
        >
          <UiIcon name="chevronLeft" />
          Retour à l'apprentissage
        </NuxtLink>
      </template>
    </UiEmptyState>

    <!-- Erreur -->
    <UiEmptyState
      v-else-if="error !== null && current === null"
      title="Impossible de charger le cours"
      title-level="h1"
      :description="error"
    >
      <template #action>
        <UiButton @click="load">Réessayer</UiButton>
      </template>
    </UiEmptyState>

    <!-- Cours -->
    <template v-else-if="current !== null">
      <header>
        <p class="micro text-ink-700">{{ current.technology }} · {{ statusLabel }}</p>
        <h1 class="mt-1 text-2xl font-semibold text-ink-100">
          {{ current.title }}
        </h1>
      </header>

      <!-- Projets liés (contrat CourseWithProjects) -->
      <section
        v-if="linkedProjects.length > 0"
        class="surface px-5 py-4"
        aria-labelledby="used-in-title"
      >
        <h2 id="used-in-title" class="micro text-ink-700">Utilisé dans</h2>
        <ul class="mt-2 flex flex-col gap-1">
          <li v-for="project in linkedProjects" :key="project.id">
            <NuxtLink
              :to="`/projets/${project.id}`"
              class="flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-ink-300 transition-colors hover:bg-surface-800 hover:text-ink-100"
            >
              <UiIcon name="folder" size="sm" class="shrink-0 text-ink-700" />
              <span class="truncate">{{ project.name }}</span>
              <span
                class="ml-auto truncate font-mono text-[11px] text-ink-700"
                :title="project.folder_path"
              >
                {{ project.folder_path }}
              </span>
            </NuxtLink>
          </li>
        </ul>
      </section>

      <div class="flex flex-col gap-8 lg:flex-row lg:items-start">
        <div class="flex min-w-0 flex-1 flex-col">
          <CourseBody :md="current.content_md" @headings="headings = $event" />

          <StatusButton
            class="mt-6"
            :status="current.status"
            :completed-at="current.completed_at"
            :busy="busy || pending"
            @finish="onFinish"
            @reset="onReset"
          />
        </div>

        <CourseToc :headings="headings" />
      </div>
    </template>
  </div>
</template>
