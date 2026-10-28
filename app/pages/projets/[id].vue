<script setup lang="ts">
import {
  useProjects,
  type ProjectWithCounts,
} from '~/composables/useProjects'
import { useToast } from '~/composables/useToast'
import type { ProjectTask } from '~~/shared/types'
import ProjectsChecklist from '~/components/projects/Checklist.vue'
import ProjectsLeadButton from '~/components/projects/LeadButton.vue'
import UiButton from '~/components/ui/UiButton.vue'
import UiCard from '~/components/ui/UiCard.vue'
import UiEmptyState from '~/components/ui/UiEmptyState.vue'
import UiSkeleton from '~/components/ui/UiSkeleton.vue'

const route = useRoute()

// `params.id` peut être string | string[] selon le routage
const projectId = computed<string>(() => {
  const raw = route.params.id
  return Array.isArray(raw) ? (raw[0] ?? '') : (raw ?? '')
})

const {
  getProject,
  listTasks,
  addTask,
  updateTask,
  deleteTask,
  reorderTasks,
} = useProjects()
const toast = useToast()

const project = ref<ProjectWithCounts | null>(null)
const tasks = ref<ProjectTask[]>([])
const loading = ref(true)
const loadError = ref<string | null>(null)
const notFound = ref(false)
const busy = ref(false)

useHead({
  title: computed(() => `${project.value?.name ?? 'Projet'} — OSSO`),
})

async function load(): Promise<void> {
  loading.value = true
  loadError.value = null
  notFound.value = false
  try {
    const [loadedProject, loadedTasks] = await Promise.all([
      getProject(projectId.value),
      listTasks(projectId.value),
    ])
    project.value = loadedProject
    tasks.value = loadedTasks
    if (!loadedProject) notFound.value = true
  } catch (err) {
    loadError.value =
      err instanceof Error ? err.message : 'Erreur inconnue.'
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  void load()
})

/** Recalcule les compteurs affichés dans l'en-tête. */
function refreshCounts(): void {
  if (!project.value) return
  const done = tasks.value.filter((task) => task.is_done).length
  project.value = {
    ...project.value,
    task_count: tasks.value.length,
    done_tasks: done,
    open_tasks: tasks.value.length - done,
  }
}

function toastError(title: string, err: unknown): void {
  toast.show({
    tone: 'error',
    title,
    message: err instanceof Error ? err.message : 'Erreur inconnue.',
  })
}

async function onToggle(task: ProjectTask): Promise<void> {
  if (busy.value) return
  busy.value = true
  try {
    const updated = await updateTask(projectId.value, task.id, {
      is_done: !task.is_done,
    })
    tasks.value = tasks.value.map((t) => (t.id === updated.id ? updated : t))
    refreshCounts()
  } catch (err) {
    toastError('Mise à jour impossible', err)
  } finally {
    busy.value = false
  }
}

async function onRename(task: ProjectTask, title: string): Promise<void> {
  if (busy.value) return
  busy.value = true
  try {
    const updated = await updateTask(projectId.value, task.id, { title })
    tasks.value = tasks.value.map((t) => (t.id === updated.id ? updated : t))
    toast.show({
      tone: 'success',
      title: 'Tâche mise à jour',
      message: `« ${updated.title} »`,
    })
  } catch (err) {
    toastError('Renommage impossible', err)
  } finally {
    busy.value = false
  }
}

async function onAdd(title: string): Promise<void> {
  if (busy.value) return
  busy.value = true
  try {
    const created = await addTask(projectId.value, title)
    tasks.value = [...tasks.value, created]
    refreshCounts()
    toast.show({
      tone: 'success',
      title: 'Tâche ajoutée',
      message: `« ${created.title} »`,
    })
  } catch (err) {
    toastError('Ajout impossible', err)
  } finally {
    busy.value = false
  }
}

async function onRemove(task: ProjectTask): Promise<void> {
  if (busy.value) return
  busy.value = true
  try {
    await deleteTask(projectId.value, task.id)
    tasks.value = tasks.value.filter((t) => t.id !== task.id)
    refreshCounts()
    toast.show({
      tone: 'success',
      title: 'Tâche supprimée',
      message: `« ${task.title} »`,
    })
  } catch (err) {
    toastError('Suppression impossible', err)
  } finally {
    busy.value = false
  }
}

async function onReorder(order: string[]): Promise<void> {
  if (busy.value) return
  const previous = tasks.value
  const byId = new Map(previous.map((task) => [task.id, task]))
  const next = order
    .map((id, index) => {
      const task = byId.get(id)
      return task ? { ...task, position: index } : null
    })
    .filter((task): task is ProjectTask => task !== null)
  // Mise à jour optimiste
  tasks.value = next
  busy.value = true
  try {
    await reorderTasks(projectId.value, order)
    toast.show({
      tone: 'success',
      title: 'Ordre enregistré',
      message: 'La checklist est à jour.',
    })
  } catch (err) {
    tasks.value = previous
    toastError('Réordonnancement impossible', err)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div>
    <!-- Chargement -->
    <div v-if="loading" class="flex flex-col gap-4" aria-busy="true" aria-label="Chargement du projet">
      <UiSkeleton class="h-8 w-64" />
      <UiSkeleton class="h-4 w-96 max-w-full" />
      <UiSkeleton class="h-64 w-full" />
    </div>

    <!-- Projet introuvable -->
    <UiEmptyState
      v-else-if="notFound"
      icon="🔍"
      title="Projet introuvable"
      description="Ce projet n’existe pas (ou n’a pas été détecté par le pont local)."
    >
      <template #action>
        <NuxtLink to="/projets">
          <UiButton variant="outline">Retour aux projets</UiButton>
        </NuxtLink>
      </template>
    </UiEmptyState>

    <!-- Erreur de chargement -->
    <UiEmptyState
      v-else-if="loadError"
      icon="⚠️"
      title="Impossible de charger ce projet"
      :description="loadError"
    >
      <template #action>
        <UiButton @click="load">Réessayer</UiButton>
      </template>
    </UiEmptyState>

    <template v-else-if="project">
      <header class="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div class="min-w-0">
          <NuxtLink
            to="/projets"
            class="inline-block rounded text-sm text-ink-300 transition-colors hover:text-ink-100 focus-visible:outline-2 focus-visible:outline-accent-400"
          >
            ← Retour aux projets
          </NuxtLink>
          <h1 class="mt-2 text-2xl font-semibold text-ink-100">
            {{ project.name }}
          </h1>
          <p
            class="mt-1 truncate text-sm text-ink-500"
            :title="project.folder_path"
          >
            {{ project.folder_path }}
          </p>
          <p class="mt-1 text-xs text-ink-300">
            {{ project.open_tasks }} tâche{{ project.open_tasks > 1 ? 's' : '' }}
            à faire · {{ project.done_tasks }}
            terminée{{ project.done_tasks > 1 ? 's' : '' }}
          </p>
        </div>

        <ProjectsLeadButton :project-id="project.id" />
      </header>

      <UiCard>
        <ProjectsChecklist
          :tasks="tasks"
          :pending="loading"
          :busy="busy"
          @toggle="onToggle"
          @save="onRename"
          @remove="onRemove"
          @add="onAdd"
          @reorder="onReorder"
        />
      </UiCard>
    </template>
  </div>
</template>
