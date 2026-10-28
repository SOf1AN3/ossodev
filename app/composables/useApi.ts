import { ref, computed, watchEffect, type Ref } from 'vue'

/** Enveloppe standard renvoyée par le serveur OSSO. */
interface ApiEnvelope<T> {
  data?: T
  error?: {
    code: string
    message: string
  }
}

export interface ApiFetchOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  body?: unknown
  query?: Record<string, string | number | boolean | undefined>
  headers?: Record<string, string>
}

function isEnvelope<T>(
  payload: ApiEnvelope<T> | T,
): payload is ApiEnvelope<T> {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
    return false
  }
  return 'error' in payload || 'data' in payload
}

/**
 * Appel HTTP qui respecte l'enveloppe serveur `{ data } | { error }`.
 * Retourne directement la donnée, ou lève une `Error` portant le message serveur.
 */
export async function apiFetch<T>(
  url: string,
  options: ApiFetchOptions = {},
): Promise<T> {
  const payload = await $fetch<ApiEnvelope<T> | T>(url, {
    method: options.method ?? 'GET',
    body: options.body,
    query: options.query,
    headers: options.headers,
  })

  if (isEnvelope<T>(payload)) {
    if (payload.error) {
      throw new Error(payload.error.message || 'Erreur inconnue')
    }
    return payload.data as T
  }

  // Réponse brute (tableau nu ou objet simple) → retour telle quelle
  return payload
}

export interface ApiListResult<T> {
  items: Ref<T[]>
  pending: Ref<boolean>
  error: Ref<Error | null>
  refresh: () => Promise<void>
}

/**
 * Wrapper `useAsyncData` pour les listes. Normalise automatiquement le cas
 * où la réponse est un tableau nu ou enveloppée dans `{ data: T[] }`.
 */
export function useApiList<T>(url: string): ApiListResult<T> {
  const items = ref<T[]>([])

  const { data, pending, error, refresh: rawRefresh } = useAsyncData<
    ApiEnvelope<T[]> | T[]
  >(url, () => apiFetch<ApiEnvelope<T[]> | T[]>(url))

  // Synchronise la donnée normalisée dans `items`
  watchEffect(() => {
    const payload = data.value
    if (!payload) {
      items.value = []
      return
    }
    if (Array.isArray(payload)) {
      items.value = payload
      return
    }
    items.value = payload.data ?? []
  })

  const refresh = async (): Promise<void> => {
    await rawRefresh()
  }

  const errorRef = computed<Error | null>(() =>
    error.value ? new Error(error.value.message) : null,
  )

  return {
    items,
    pending,
    error: errorRef,
    refresh,
  }
}
