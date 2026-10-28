import { ref } from 'vue'
import type { Idea } from '~~/shared/types'
import { apiFetch } from './useApi'

export interface IdeaPayload {
  title: string
  description?: string | null
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

export function useIdeas() {
  const pending = ref(false)
  const error = ref<string | null>(null)

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

  /** Les idées les plus récentes en premier. */
  function listIdeas(): Promise<Idea[]> {
    return run(
      () => apiFetch<Idea[]>('/api/ideas'),
      'Impossible de charger les idées.',
    )
  }

  function createIdea(payload: IdeaPayload): Promise<Idea> {
    return run(
      () => apiFetch<Idea>('/api/ideas', { method: 'POST', body: payload }),
      'Impossible d’enregistrer l’idée.',
    )
  }

  function updateIdea(id: string, patch: IdeaPayload): Promise<Idea> {
    return run(
      () =>
        apiFetch<Idea>(`/api/ideas/${id}`, { method: 'PATCH', body: patch }),
      'Impossible de modifier l’idée.',
    )
  }

  async function deleteIdea(id: string): Promise<void> {
    await run(
      () => apiFetch<{ id: string }>(`/api/ideas/${id}`, { method: 'DELETE' }),
      'Impossible de supprimer l’idée.',
    )
  }

  return {
    pending,
    error,
    listIdeas,
    createIdea,
    updateIdea,
    deleteIdea,
  }
}
