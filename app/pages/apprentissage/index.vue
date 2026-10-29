<script setup lang="ts">
import type { LearningCourseSummary } from '~~/shared/types'
import { useLearning } from '~/composables/useLearning'
import CourseList from '~/components/learning/CourseList.vue'
import UiButton from '~/components/ui/UiButton.vue'
import UiEmptyState from '~/components/ui/UiEmptyState.vue'
import UiSkeleton from '~/components/ui/UiSkeleton.vue'

useHead({ title: 'Apprentissage — OSSO' })

const { list } = useLearning()

const courses = ref<LearningCourseSummary[]>([])
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
    loadError.value =
      err instanceof Error ? err.message : 'Impossible de charger les cours.'
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  void load()
})
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
      <div
        v-for="n in 4"
        :key="n"
        class="surface flex flex-col gap-3 px-5 py-4"
        aria-hidden="true"
      >
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

    <!-- Liste -->
    <CourseList v-else :courses="courses" />
  </div>
</template>
