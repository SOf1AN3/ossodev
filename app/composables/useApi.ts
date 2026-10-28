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

/**
 * Options de fetch déclarées à la main : on contourne volontairement
 * l'inférence des routes Nitro par `$fetch` (~45 routes, dont des routes
 * imbriquées), qui provoque « TS2321 : excessive stack depth ».
 */
interface FetchOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  body?: Record<string, unknown> | null | undefined
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
  const fetchOptions: FetchOptions = {
    method: options.method ?? 'GET',
    // Cast ciblé : `ApiFetchOptions.body` est `unknown` pour accepter tout ce
    // que sait encoder ofetch (objet, `FormData`, `string`…). On transmet le
    // corps tel quel, sans aucune transformation — seule la signature TS est
    // adaptée ici, le comportement runtime est inchangé.
    body: options.body as Record<string, unknown> | null | undefined,
    query: options.query,
    headers: options.headers,
  }

  // `$fetch.raw` contourne volontairement les surcharges « typed routes » de
  // Nitro sur `$fetch` (inférence des ~45 routes du projet → « TS2321 :
  // excessive stack depth »). Le runtime est strictement identique :
  // ofetch implémente `$fetch(url, opts)` comme `(await $fetch.raw(url,
  // opts))._data`. On lit donc `_data` manuellement, typé via le générique.
  const response = await $fetch.raw<ApiEnvelope<T> | T>(url, fetchOptions)
  // `_data` est `ApiEnvelope<T> | TypedInternalResponse<…> | undefined` dans
  // les types Nitro ; on sait qu'ici c'est toujours le corps JSON parsé.
  const payload = response._data as ApiEnvelope<T> | T

  if (isEnvelope<T>(payload)) {
    if (payload.error) {
      throw new Error(payload.error.message || 'Erreur inconnue')
    }
    // Comportement historique conservé : `data` est retourné même s'il est
    // absent (réponse `{ }` → `undefined`), d'où la conversion explicite.
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
  // Cast ciblé : `ref<T[]>` s'infère comme `Ref<UnwrapRefSimple<T>[]>` à cause
  // du dé-ballage réactif de Vue, incompatible avec le contrat public
  // `Ref<T[]>`. Légitime ici : `items` n'est muté que par remplacement de
  // `.value` (jamais en place), donc aucun proxy réactif n'est attendu.
  const items = ref<T[]>([]) as Ref<T[]>

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
