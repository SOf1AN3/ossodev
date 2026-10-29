import { ref, computed, readonly } from 'vue'
import type { CompanionStatus } from '~~/shared/types'
import { apiFetch } from './useApi'

/** Raison affichée dès que le Companion n'est pas confirmé en ligne. */
export const COMPANION_OFFLINE_REASON =
  'Le Companion n’est pas en ligne sur ce poste.'

/**
 * État d'une commande déposée dans la file du Companion
 * (contrat `POST /api/projects/:id/lead` → `{ command_id, status }`).
 */
export interface LeadIssue {
  /** Identifiant de la commande en file d'attente. */
  command_id?: string
  /** `pending` tant que le Companion ne l'a pas réclamée. */
  status?: string
}

// Store partagé au module : le statut du Companion est chargé **une seule fois**
// pour toute l'app (y compris après navigation entre pages).
const status = ref<CompanionStatus | null>(null)
const pending = ref(false)
let loaded = false
// Demandes concurrentes (rail + topbar montent dans le même tick) : la seconde
// attend la première — jamais deux requêtes simultanées.
let inFlight: Promise<void> | null = null

/** Traduit une erreur inconnue en raison française, jamais d'anglais à l'écran. */
function toOfflineReason(err: unknown): string {
  if (err instanceof Error) {
    const message = err.message.trim()
    if (
      message === '' ||
      message === 'Failed to fetch' ||
      message === 'fetch failed'
    ) {
      return 'Impossible de contacter le serveur OSSO.'
    }
  }
  return COMPANION_OFFLINE_REASON
}

/**
 * Message français d'une erreur API.
 *
 * `apiFetch` laisse remonter le `FetchError` d'ofetch : on y lit d'abord le
 * corps parsé (`{ error: { message } }`, déjà rédigé en français par
 * `runApi`), sinon on traduit l'erreur réseau. Jamais de brut du type
 * « [POST] … 409 Conflict » affiché à l'utilisateur.
 */
export function apiErrorMessage(err: unknown, fallback: string): string {
  const envelope = readEnvelopeMessage(err)
  if (envelope !== null) return envelope
  if (err instanceof Error) {
    const message = err.message.trim()
    if (
      message === '' ||
      message === 'Failed to fetch' ||
      message === 'fetch failed'
    ) {
      return 'Impossible de contacter le serveur OSSO. Vérifie que l’application tourne bien.'
    }
    const status = HTTP_STATUS_PATTERN.exec(message)
    if (status !== null) {
      return `Le serveur a répondu ${status[1]}. ${fallback}`
    }
    return message
  }
  return fallback
}

/** `: 409 Conflict` dans le message brut d'ofetch. */
const HTTP_STATUS_PATTERN = /:\s*(\d{3})(?:\s|$)/

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Lit `{ error: { message } }` attaché par ofetch sur les réponses en échec. */
function readEnvelopeMessage(err: unknown): string | null {
  if (!(err instanceof Error)) return null
  if (!('data' in err)) return null
  const data: unknown = err.data
  if (!isRecord(data)) return null
  const apiError: unknown = data.error
  if (!isRecord(apiError)) return null
  const message: unknown = apiError.message
  if (typeof message !== 'string') return null
  const trimmed = message.trim()
  return trimmed === '' ? null : trimmed
}

/**
 * Raison du hors-ligne **sans répéter le libellé déjà affiché à côté** :
 * le serveur peut renvoyer « Companion hors ligne : dernière présence … ».
 * Retourne `null` quand il n'y a rien de plus à dire.
 */
export function companionReasonDetail(reason: string | null): string | null {
  if (reason === null) return null
  const cleaned = reason.trim()
  if (cleaned === '') return null
  const prefix = 'companion hors ligne'
  if (cleaned.toLowerCase().startsWith(prefix)) {
    const rest = cleaned.slice(prefix.length).replace(/^[\s:—-]+/, '')
    return rest === '' ? null : rest
  }
  return cleaned
}

export function useCompanion() {
  /** Vrai uniquement si le Companion est confirmé en ligne. */
  const canRunLocal = computed<boolean>(() => status.value?.available === true)

  /**
   * Charge la présence du Companion. Sans `force`, n'effectue la requête qu'une
   * seule fois (garde module-scope `loaded`), exactement comme `useBridge`.
   * En cas d'échec, on fige un statut « hors ligne » : aucun bouton ne partira.
   */
  async function refresh(force = false): Promise<void> {
    if (loaded && !force) return
    if (inFlight !== null) {
      await inFlight
      return
    }
    pending.value = true
    const request = (async () => {
      try {
        const fetched = await apiFetch<CompanionStatus | undefined>(
          '/api/companion/status',
        )
        // Réponse vide (`{}`) : jamais interprétée comme une présence.
        status.value = fetched ?? {
          available: false,
          lastSeenAt: null,
          reason: COMPANION_OFFLINE_REASON,
        }
        loaded = true
      } catch (err) {
        status.value = {
          available: false,
          lastSeenAt: null,
          reason: toOfflineReason(err),
        }
      } finally {
        pending.value = false
        inFlight = null
      }
    })()
    inFlight = request
    await request
  }

  /**
   * Dépose la session LEAD dans la file du Companion. **Refusé côté client**
   * si le Companion est hors ligne : aucune requête n'est envoyée.
   */
  async function enqueueLead(projectId: string): Promise<LeadIssue> {
    if (!canRunLocal.value) {
      throw new Error(status.value?.reason ?? COMPANION_OFFLINE_REASON)
    }
    try {
      // `apiFetch` peut renvoyer `undefined` si le serveur répond `{}` :
      // on repart toujours d'un objet pour l'affichage.
      const issue = await apiFetch<LeadIssue | undefined>(
        `/api/projects/${projectId}/lead`,
        { method: 'POST' },
      )
      return issue ?? {}
    } catch (err) {
      throw new Error(apiErrorMessage(err, 'La commande LEAD n’a pas pu être mise en file.'))
    }
  }

  return {
    status: readonly(status),
    pending,
    canRunLocal,
    refresh,
    enqueueLead,
  }
}
