<script setup lang="ts">
import type { CourseHeading } from '~/composables/useMarkdown'
import {
  LearningApiError,
  useLearning,
} from '~/composables/useLearning'
import { useToast } from '~/composables/useToast'
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

useHead({
  title: computed(() => `${current.value?.title ?? 'Cours'} — OSSO`),
})

const statusLabel = computed<string>(() =>
  current.value?.status === 'done' ? 'Accompli' : 'À lire',
)

async function load(): Promise<void> {
  loading.value = true
  notFound.value = false
  headings.value = []
  try {
    await get(slug.value)
  } catch (err) {
    current.value = null
    notFound.value =
      err instanceof LearningApiError && err.status === 404
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
      <div
        class="surface flex flex-col gap-4 px-6 py-5"
        aria-hidden="true"
      >
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
        <p class="micro text-ink-700">
          {{ current.technology }} · {{ statusLabel }}
        </p>
        <h1 class="mt-1 text-2xl font-semibold text-ink-100">
          {{ current.title }}
        </h1>
      </header>

      <div class="flex flex-col gap-8 lg:flex-row lg:items-start">
        <div class="flex min-w-0 flex-1 flex-col">
          <CourseBody
            :md="current.content_md"
            @headings="headings = $event"
          />

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
