import { ref, computed, type Ref } from 'vue'
import type { Task, TaskInput } from '~~/shared/types'
import { apiFetch } from './useApi'
import { addDays, fromISODate, toISODate } from '~/utils/dates'

/**
 * Tâche telle que renvoyée par l'API : `Task` enrichie de l'indicateur
 * de retard calculé côté serveur.
 */
export type TaskWithOverdue = Task & { is_overdue: boolean }

/** Mise à jour partielle acceptée par `PATCH /api/tasks/:id`. */
export interface TaskPatch {
  title?: string
  notes?: string | null
  status?: Task['status']
  priority?: number
  scheduled_date?: string
  points?: number
}

/** Plafond d'intervalle imposé par le serveur (en jours). */
const MAX_RANGE_DAYS = 60

function toFrenchMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message
  }
  return 'Une erreur est survenue. Réessaie plus tard.'
}

/** Option de rechargement : `silent` évite de re-passer en état « chargement ». */
export interface LoadOptions {
  silent?: boolean
}

export interface UseTasksReturn {
  /** Tâches du jour + retards (dernier `view=today` chargé). */
  tasks: Ref<TaskWithOverdue[]>
  /** Tâches de l'intervalle courant (calendrier). */
  rangeTasks: Ref<TaskWithOverdue[]>
  /** Tâches du jour, hors retards. */
  today: Ref<TaskWithOverdue[]>
  /** Tâches en retard. */
  overdue: Ref<TaskWithOverdue[]>
  pending: Ref<boolean>
  rangePending: Ref<boolean>
  error: Ref<string | null>
  rangeError: Ref<string | null>
  loadToday: (options?: LoadOptions) => Promise<void>
  loadRange: (from: string, to: string, options?: LoadOptions) => Promise<void>
  createTask: (input: TaskInput) => Promise<Task>
  updateTask: (id: string, patch: TaskPatch) => Promise<Task>
  deleteTask: (id: string) => Promise<void>
  moveTask: (id: string, scheduledDate: string) => Promise<Task>
  toggleDone: (task: TaskWithOverdue) => Promise<Task>
}

export function useTasks(): UseTasksReturn {
  const tasks = ref<TaskWithOverdue[]>([])
  const rangeTasks = ref<TaskWithOverdue[]>([])
  const pending = ref(false)
  const rangePending = ref(false)
  const error = ref<string | null>(null)
  const rangeError = ref<string | null>(null)

  /** Dernier intervalle chargé, pour recharger après une mutation. */
  let lastRange: { from: string; to: string } | null = null

  const today = computed<TaskWithOverdue[]>(() =>
    tasks.value.filter((task) => !task.is_overdue),
  )

  const overdue = computed<TaskWithOverdue[]>(() =>
    tasks.value.filter((task) => task.is_overdue),
  )

  async function loadToday(options?: LoadOptions): Promise<void> {
    const silent = options?.silent === true
    if (!silent) {
      pending.value = true
      error.value = null
    }
    try {
      const rows = await apiFetch<TaskWithOverdue[]>('/api/tasks?view=today')
      tasks.value = Array.isArray(rows) ? rows : []
    } catch (loadError) {
      error.value = toFrenchMessage(loadError)
    } finally {
      if (!silent) pending.value = false
    }
  }

  async function loadRange(
    from: string,
    to: string,
    options?: LoadOptions,
  ): Promise<void> {
    const silent = options?.silent === true
    lastRange = { from, to }
    if (!silent) {
      rangePending.value = true
      rangeError.value = null
    }
    try {
      // Plafond serveur à 60 jours : on tronque plutôt que d'envoyer un
      // intervalle plus large.
      const cappedTo = toISODate(addDays(fromISODate(from), MAX_RANGE_DAYS - 1))
      const effectiveTo = cappedTo < to ? cappedTo : to
      const rows = await apiFetch<TaskWithOverdue[]>(
        `/api/tasks?from=${from}&to=${effectiveTo}`,
      )
      rangeTasks.value = Array.isArray(rows) ? rows : []
    } catch (loadError) {
      rangeError.value = toFrenchMessage(loadError)
    } finally {
      if (!silent) rangePending.value = false
    }
  }

  /** Recharge les vues déjà chargées après une mutation, sans re-flash du skeleton. */
  async function refreshAfterMutation(): Promise<void> {
    await loadToday({ silent: true })
    if (lastRange) {
      await loadRange(lastRange.from, lastRange.to, { silent: true })
    }
  }

  async function createTask(input: TaskInput): Promise<Task> {
    const created = await apiFetch<Task>('/api/tasks', {
      method: 'POST',
      body: input,
    })
    await refreshAfterMutation()
    return created
  }

  async function updateTask(id: string, patch: TaskPatch): Promise<Task> {
    const updated = await apiFetch<Task>(`/api/tasks/${id}`, {
      method: 'PATCH',
      body: patch,
    })
    await refreshAfterMutation()
    return updated
  }

  async function deleteTask(id: string): Promise<void> {
    await apiFetch<{ id: string }>(`/api/tasks/${id}`, {
      method: 'DELETE',
    })
    await refreshAfterMutation()
  }

  async function moveTask(id: string, scheduledDate: string): Promise<Task> {
    const moved = await apiFetch<Task>(`/api/tasks/${id}/move`, {
      method: 'POST',
      body: { scheduled_date: scheduledDate },
    })
    await refreshAfterMutation()
    return moved
  }

  /** Bascule `done` ⇄ `todo` (le serveur gère `completed_at`). */
  async function toggleDone(task: TaskWithOverdue): Promise<Task> {
    const nextStatus: Task['status'] = task.status === 'done' ? 'todo' : 'done'
    return updateTask(task.id, { status: nextStatus })
  }

  return {
    tasks,
    rangeTasks,
    today,
    overdue,
    pending,
    rangePending,
    error,
    rangeError,
    loadToday,
    loadRange,
    createTask,
    updateTask,
    deleteTask,
    moveTask,
    toggleDone,
  }
}
