import { ref } from 'vue'
import type {
  LearningCourse,
  LearningCourseSummary,
  LearningStatus,
} from '~~/shared/types'
import { apiFetch } from './useApi'

/**
 * Résultat de `PATCH /api/learning/:technology/status`.
 * Le serveur ne renvoie que les colonnes impactées (contrat PLAN §piste B) :
 * `title` / `content_md` restent ceux déjà chargés dans `current`.
 */
export interface LearningStatusResult {
  technology: string
  status: LearningStatus
  /** ISO 8601 — posé en `done`, remis à `null` en `todo`. */
  completed_at: string | null
}

/** Erreur API normalisée : message français lisible + statut HTTP éventuel. */
export class LearningApiError extends Error {
  readonly status: number | null

  constructor(message: string, status: number | null) {
    super(message)
    this.name = 'LearningApiError'
    this.status = status
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

interface NormalizedError {
  message: string
  status: number | null
}

/**
 * Traduit une erreur ofetch (FetchError `statusCode` + enveloppe `{ error }`)
 * en message français lisible, sans jamais fuiter de technique anglophone.
 */
function normalizeError(err: unknown, fallback: string): NormalizedError {
  if (isRecord(err)) {
    const rawStatus = err['statusCode']
    const status = typeof rawStatus === 'number' ? rawStatus : null

    // Enveloppe serveur : { error: { code, message } }
    const data = err['data']
    if (isRecord(data)) {
      const envelope = data['error']
      if (isRecord(envelope)) {
        const message = envelope['message']
        if (typeof message === 'string' && message.length > 0) {
          return { message, status }
        }
      }
    }

    const message = err['message']
    if (typeof message === 'string') {
      // Panne réseau : message ofetch illisible pour l'utilisateur.
      if (message === 'fetch failed' || message === 'Failed to fetch') {
        return {
          message:
            'Impossible de contacter le serveur. Vérifie que l’application OSSO tourne bien.',
          status,
        }
      }
      // Erreur HTTP sans enveloppe : on préfère le repli français.
      if (status === null && message.length > 0) {
        return { message, status }
      }
    }
    return { message: fallback, status }
  }
  return { message: fallback, status: null }
}

const COMPLETED_SINCE_FORMAT = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

/** « Accompli depuis le 29 octobre 2026 » — statut `done`. */
export function formatCompletedSince(iso: string | null): string {
  if (iso === null) return 'Accompli'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return 'Accompli'
  return `Accompli depuis le ${COMPLETED_SINCE_FORMAT.format(date)}`
}

/**
 * Accès API de la section Apprentissage (piste B).
 * `list` ne renvoie JAMAIS de `content_md` : le serveur l'omet déjà.
 */
export function useLearning() {
  const pending = ref(false)
  const error = ref<string | null>(null)
  const current = ref<LearningCourse | null>(null)

  /** Exécute un appel API en pilotant `pending` / `error`, puis relève l'erreur typée. */
  async function run<T>(task: () => Promise<T>, fallback: string): Promise<T> {
    pending.value = true
    error.value = null
    try {
      return await task()
    } catch (err) {
      const apiError =
        err instanceof LearningApiError ? err : toApiError(err, fallback)
      error.value = apiError.message
      throw apiError
    } finally {
      pending.value = false
    }
  }

  function list(): Promise<LearningCourseSummary[]> {
    return run(
      () => apiFetch<LearningCourseSummary[]>('/api/learning'),
      'Impossible de charger les cours.',
    )
  }

  /** Charge un cours complet et le pose dans `current`. */
  async function get(slug: string): Promise<LearningCourse> {
    const course = await run(
      () =>
        apiFetch<LearningCourse>(
          `/api/learning/${encodeURIComponent(slug)}`,
        ),
      'Impossible de charger ce cours.',
    )
    current.value = course
    return course
  }

  /** Bascule `todo` ⇄ `done` et synchronise `current` (statut + `completed_at`). */
  async function setStatus(
    slug: string,
    status: LearningStatus,
  ): Promise<LearningStatusResult> {
    const result = await run(
      () =>
        apiFetch<LearningStatusResult>(
          `/api/learning/${encodeURIComponent(slug)}/status`,
          { method: 'PATCH', body: { status } },
        ),
      'Impossible de mettre à jour le statut.',
    )

    const active = current.value
    if (active !== null && active.technology === slug) {
      current.value = {
        ...active,
        status: result.status,
        completed_at: result.completed_at,
      }
    }
    return result
  }

  return { pending, error, current, list, get, setStatus }
}

function toApiError(err: unknown, fallback: string): LearningApiError {
  const normalized = normalizeError(err, fallback)
  return new LearningApiError(normalized.message, normalized.status)
}
