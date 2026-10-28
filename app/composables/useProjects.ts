import { ref } from 'vue'
import type { Project, ProjectTask } from '~~/shared/types'
import { apiFetch } from './useApi'

/** `Project` enrichi par le serveur avec les compteurs de tâches. */
export interface ProjectWithCounts extends Project {
  task_count: number
  open_tasks: number
  done_tasks: number
}

export interface ProjectPatch {
  name?: string
  folder_path?: string
  is_archived?: boolean
}

export interface ProjectTaskPatch {
  title?: string
  is_done?: boolean
}

interface ReorderResult {
  projectId: string
  order: string[]
}

/** Traduit une erreur inconnue en message français lisible. */
function toApiErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error) {
    const message = err.message.trim()
    if (
      message === '' ||
      message === 'Failed to fetch' ||
      message === 'fetch failed'
    ) {
      return 'Impossible de contacter le serveur. Vérifie que l’application OSSO tourne bien.'
    }
    return message
  }
  return fallback
}

export function useProjects() {
  const pending = ref(false)
  const error = ref<string | null>(null)

  /** Exécute une appel API en pilotant `pending`/`error`, puis re-lève l'erreur. */
  async function run<T>(task: () => Promise<T>, fallback: string): Promise<T> {
    pending.value = true
    error.value = null
    try {
      return await task()
    } catch (err) {
      const message = toApiErrorMessage(err, fallback)
      error.value = message
      throw new Error(message)
    } finally {
      pending.value = false
    }
  }

  function listProjects(includeArchived = false): Promise<ProjectWithCounts[]> {
    return run(
      () =>
        apiFetch<ProjectWithCounts[]>('/api/projects', {
          query: { includeArchived },
        }),
      'Impossible de charger les projets.',
    )
  }

  /**
   * Charge un projet précis. N'ayant pas de route dédiée dans le contrat API,
   * on cherche dans la liste complète (archivés inclus).
   */
  function getProject(id: string): Promise<ProjectWithCounts | null> {
    return run(async () => {
      const all = await apiFetch<ProjectWithCounts[]>('/api/projects', {
        query: { includeArchived: true },
      })
      return all.find((project) => project.id === id) ?? null
    }, 'Impossible de charger ce projet.')
  }

  function createProject(input: {
    name: string
    folder_path: string
    is_archived?: boolean
  }): Promise<Project> {
    return run(
      () => apiFetch<Project>('/api/projects', { method: 'POST', body: input }),
      'Impossible d’ajouter le projet.',
    )
  }

  function updateProject(id: string, patch: ProjectPatch): Promise<Project> {
    return run(
      () =>
        apiFetch<Project>(`/api/projects/${id}`, {
          method: 'PATCH',
          body: patch,
        }),
      'Impossible de modifier le projet.',
    )
  }

  async function deleteProject(id: string): Promise<void> {
    await run(
      () =>
        apiFetch<{ id: string }>(`/api/projects/${id}`, { method: 'DELETE' }),
      'Impossible de supprimer le projet.',
    )
  }

  function listTasks(projectId: string): Promise<ProjectTask[]> {
    return run(
      () =>
        apiFetch<ProjectTask[]>(`/api/projects/${projectId}/tasks`).then(
          (tasks) => [...tasks].sort((a, b) => a.position - b.position),
        ),
      'Impossible de charger les tâches.',
    )
  }

  function addTask(projectId: string, title: string): Promise<ProjectTask> {
    return run(
      () =>
        apiFetch<ProjectTask>(`/api/projects/${projectId}/tasks`, {
          method: 'POST',
          body: { title },
        }),
      'Impossible d’ajouter la tâche.',
    )
  }

  function updateTask(
    projectId: string,
    taskId: string,
    patch: ProjectTaskPatch,
  ): Promise<ProjectTask> {
    return run(
      () =>
        apiFetch<ProjectTask>(
          `/api/projects/${projectId}/tasks/${taskId}`,
          { method: 'PATCH', body: patch },
        ),
      'Impossible de modifier la tâche.',
    )
  }

  async function deleteTask(projectId: string, taskId: string): Promise<void> {
    await run(
      () =>
        apiFetch<{ id: string }>(
          `/api/projects/${projectId}/tasks/${taskId}`,
          { method: 'DELETE' },
        ),
      'Impossible de supprimer la tâche.',
    )
  }

  async function reorderTasks(
    projectId: string,
    order: string[],
  ): Promise<void> {
    await run(
      () =>
        apiFetch<ReorderResult>(
          `/api/projects/${projectId}/tasks/reorder`,
          { method: 'POST', body: { order } },
        ),
      'Impossible d’enregistrer le nouvel ordre des tâches.',
    )
  }

  return {
    pending,
    error,
    listProjects,
    getProject,
    createProject,
    updateProject,
    deleteProject,
    listTasks,
    addTask,
    updateTask,
    deleteTask,
    reorderTasks,
  }
}
