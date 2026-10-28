import { ref, type Ref } from 'vue'
import type { Routine, RoutineInput } from '~~/shared/types'
import { apiFetch } from './useApi'

/**
 * Routine telle que renvoyée par l'API : `Routine` enrichie des 5 prochaines
 * occurrences (vide si la routine est inactive).
 */
export type RoutineWithNext = Routine & { next_dates: string[] }

/** Mise à jour partielle acceptée par `PATCH /api/routines/:id`. */
export interface RoutinePatch {
  title?: string
  frequency?: Routine['frequency']
  weekdays?: number[] | null
  points?: number
  is_active?: boolean
  start_date?: string
}

function toFrenchMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message
  }
  return 'Une erreur est survenue. Réessaie plus tard.'
}

/** Option de rechargement : `silent` évite de re-passer en état « chargement ». */
export interface RoutinesLoadOptions {
  silent?: boolean
}

export interface UseRoutinesReturn {
  routines: Ref<RoutineWithNext[]>
  pending: Ref<boolean>
  error: Ref<string | null>
  load: (options?: RoutinesLoadOptions) => Promise<void>
  createRoutine: (input: RoutineInput) => Promise<Routine>
  updateRoutine: (id: string, patch: RoutinePatch) => Promise<Routine>
  deleteRoutine: (id: string) => Promise<void>
}

export function useRoutines(): UseRoutinesReturn {
  const routines = ref<RoutineWithNext[]>([])
  const pending = ref(false)
  const error = ref<string | null>(null)

  async function load(options?: RoutinesLoadOptions): Promise<void> {
    const silent = options?.silent === true
    if (!silent) {
      pending.value = true
      error.value = null
    }
    try {
      const rows = await apiFetch<RoutineWithNext[]>('/api/routines')
      routines.value = Array.isArray(rows) ? rows : []
    } catch (loadError) {
      error.value = toFrenchMessage(loadError)
    } finally {
      if (!silent) pending.value = false
    }
  }

  async function createRoutine(input: RoutineInput): Promise<Routine> {
    const created = await apiFetch<Routine>('/api/routines', {
      method: 'POST',
      body: input,
    })
    await load({ silent: true })
    return created
  }

  async function updateRoutine(
    id: string,
    patch: RoutinePatch,
  ): Promise<Routine> {
    const updated = await apiFetch<Routine>(`/api/routines/${id}`, {
      method: 'PATCH',
      body: patch,
    })
    await load({ silent: true })
    return updated
  }

  async function deleteRoutine(id: string): Promise<void> {
    await apiFetch<{ id: string }>(`/api/routines/${id}`, {
      method: 'DELETE',
    })
    await load({ silent: true })
  }

  return {
    routines,
    pending,
    error,
    load,
    createRoutine,
    updateRoutine,
    deleteRoutine,
  }
}
