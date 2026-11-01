<script setup lang="ts">
import { useProjects, type ProjectWithCounts } from '~/composables/useProjects'
import { useToast } from '~/composables/useToast'
import { apiFetch } from '~/composables/useApi'
import type { ProjectTaskNode } from '~~/shared/types'
import ProjectsChecklist from '~/components/projects/Checklist.vue'
import ProjectsLeadButton from '~/components/projects/LeadButton.vue'
import UiButton from '~/components/ui/UiButton.vue'
import UiEmptyState from '~/components/ui/UiEmptyState.vue'
import UiIcon from '~/components/ui/UiIcon.vue'
import UiSkeleton from '~/components/ui/UiSkeleton.vue'

const route = useRoute()

// `params.id` peut être string | string[] selon le routage
const projectId = computed<string>(() => {
  const raw = route.params.id
  return Array.isArray(raw) ? (raw[0] ?? '') : (raw ?? '')
})

const { getProject, updateTask, deleteTask, reorderTasks } = useProjects()
const toast = useToast()

const project = ref<ProjectWithCounts | null>(null)
const tasks = ref<ProjectTaskNode[]>([])
const loading = ref(true)
const loadError = ref<string | null>(null)
const notFound = ref(false)
const busy = ref(false)

useHead({
  title: computed(() => `${project.value?.name ?? 'Projet'} — OSSO`),
})

/** Arbre des tâches — le serveur construit la hiérarchie (`ProjectTaskNode`). */
function fetchTasks(): Promise<ProjectTaskNode[]> {
  return apiFetch<ProjectTaskNode[]>(`/api/projects/${projectId.value}/tasks`)
}

async function load(): Promise<void> {
  loading.value = true
  loadError.value = null
  notFound.value = false
  try {
    const [loadedProject, loadedTasks] = await Promise.all([
      getProject(projectId.value),
      fetchTasks(),
    ])
    project.value = loadedProject
    tasks.value = loadedTasks
    if (!loadedProject) notFound.value = true
  } catch (err) {
    loadError.value = err instanceof Error ? err.message : 'Erreur inconnue.'
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  void load()
})

/** Recharge l'arbre après une mutation : le statut des parents vient du serveur. */
async function refreshTasks(): Promise<void> {
  tasks.value = await fetchTasks()
  refreshCounts()
}

/** Compteurs récursifs sur tout l'arbre (racines + descendants). */
function countTree(nodes: ProjectTaskNode[]): { total: number; done: number } {
  let total = 0
  let done = 0
  for (const node of nodes) {
    total += 1
    if (node.is_done) done += 1
    const sub = countTree(node.children)
    total += sub.total
    done += sub.done
  }
  return { total, done }
}

/** Recalcule les compteurs affichés dans l'en-tête. */
function refreshCounts(): void {
  if (!project.value) return
  const { total, done } = countTree(tasks.value)
  project.value = {
    ...project.value,
    task_count: total,
    done_tasks: done,
    open_tasks: total - done,
  }
}

function toastError(title: string, err: unknown): void {
  toast.show({
    tone: 'error',
    title,
    message: err instanceof Error ? err.message : 'Erreur inconnue.',
  })
}

async function onToggle(task: ProjectTaskNode): Promise<void> {
  if (busy.value) return
  busy.value = true
  try {
    await updateTask(projectId.value, task.id, { is_done: !task.is_done })
    await refreshTasks()
  } catch (err) {
    toastError('Mise à jour impossible', err)
  } finally {
    busy.value = false
  }
}

async function onRename(task: ProjectTaskNode, title: string): Promise<void> {
  if (busy.value) return
  busy.value = true
  try {
    await updateTask(projectId.value, task.id, { title })
    await refreshTasks()
    toast.show({
      tone: 'success',
      title: 'Tâche mise à jour',
      message: `« ${title} »`,
    })
  } catch (err) {
    toastError('Renommage impossible', err)
  } finally {
    busy.value = false
  }
}

async function onAdd(title: string, parentId: string | null): Promise<void> {
  if (busy.value) return
  busy.value = true
  try {
    await apiFetch(`/api/projects/${projectId.value}/tasks`, {
      method: 'POST',
      body: { title, parent_id: parentId },
    })
    await refreshTasks()
    toast.show({
      tone: 'success',
      title: 'Tâche ajoutée',
      message: `« ${title} »`,
    })
  } catch (err) {
    toastError('Ajout impossible', err)
  } finally {
    busy.value = false
  }
}

async function onRemove(task: ProjectTaskNode): Promise<void> {
  if (busy.value) return
  busy.value = true
  try {
    await deleteTask(projectId.value, task.id)
    await refreshTasks()
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
    .map((id) => byId.get(id))
    .filter((task): task is ProjectTaskNode => task !== undefined)
  // Mise à jour optimiste (uniquement les racines bougent, les filles suivent)
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
  <div class="page-enter">
    <!-- Chargement -->
    <div
      v-if="loading"
      class="flex flex-col gap-4"
      aria-busy="true"
      aria-label="Chargement du projet"
    >
      <h1 class="sr-only">Chargement du projet…</h1>
      <UiSkeleton class="h-8 w-64" />
      <UiSkeleton class="h-4 w-96 max-w-full" />
      <UiSkeleton class="h-64 w-full" />
    </div>

    <!-- Projet introuvable -->
    <div v-else-if="notFound">
      <UiEmptyState
        title="Projet introuvable"
        title-level="h1"
        description="Ce projet n’existe pas (ou n’a pas été détecté par le Companion)."
      >
        <template #action>
          <NuxtLink to="/projets">
            <UiButton variant="outline">Retour aux projets</UiButton>
          </NuxtLink>
        </template>
      </UiEmptyState>
    </div>

    <!-- Erreur de chargement -->
    <div v-else-if="loadError">
      <UiEmptyState
        title="Impossible de charger ce projet"
        title-level="h1"
        :description="loadError"
      >
        <template #action>
          <UiButton @click="load">Réessayer</UiButton>
        </template>
      </UiEmptyState>
    </div>

    <template v-else-if="project">
      <header class="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div class="min-w-0">
          <NuxtLink
            to="/projets"
            class="inline-flex items-center gap-1 rounded-xs text-sm text-ink-300 transition-colors hover:text-ink-100"
          >
            <UiIcon name="chevronLeft" size="sm" />
            Retour aux projets
          </NuxtLink>
          <h1 class="mt-2 text-2xl font-semibold text-ink-100">
            {{ project.name }}
          </h1>
          <p class="mt-1 truncate font-mono text-[12px] text-ink-700" :title="project.folder_path">
            {{ project.folder_path }}
          </p>
          <p class="mt-2 text-xs text-ink-300">
            <span class="tnum">{{ project.open_tasks }}</span>
            tâche{{ project.open_tasks > 1 ? 's' : '' }} à faire ·
            <span class="tnum">{{ project.done_tasks }}</span>
            terminée{{ project.done_tasks > 1 ? 's' : '' }}
          </p>
        </div>

        <ProjectsLeadButton :project-id="project.id" />
      </header>

      <!-- Avertissement : prompt sans liste de tâches -->
      <div
        v-if="tasks.length === 0"
        class="surface mb-4 flex flex-col gap-1 px-4 py-3"
        role="status"
      >
        <p class="micro text-ink-500">Prompt LEAD</p>
        <p class="text-sm text-ink-300">
          Aucune tâche dans ce projet — le prompt partira sans liste.
        </p>
      </div>

      <div class="rounded-md border border-line bg-surface-800 px-4 py-3.5">
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
      </div>
    </template>
  </div>
</template>
