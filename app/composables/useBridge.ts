import { ref, computed, readonly } from 'vue'
import type { BridgeStatus } from '~~/shared/types'
import { apiFetch } from './useApi'

/** Rapport renvoyé par `POST /api/brain/scan`. */
export interface ScanReport {
  devRoot: string
  scanned: number
  detected: number
  added: number
  updated: number
  projects: string[]
  errors: string[]
}

// Store partagé au module : le statut du pont est chargé **une seule fois**
// pour toute l'app (y compris après navigation entre pages).
const status = ref<BridgeStatus | null>(null)
const pending = ref(false)
const error = ref<string | null>(null)
const scanning = ref(false)
let loaded = false

/** Traduit une erreur inconnue en message français lisible. */
function toApiErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error) {
    const message = err.message.trim()
    if (
      message === '' ||
      message === 'Failed to fetch' ||
      message === 'fetch failed'
    ) {
      return 'Impossible de contacter le serveur local. Vérifie que l’application OSSO tourne bien.'
    }
    return message
  }
  return fallback
}

export function useBridge() {
  /** Vrai uniquement si le pont local est confirmé disponible. */
  const canRunLocal = computed<boolean>(() => status.value?.available === true)

  /**
   * Charge le statut du pont. Sans `force`, n'effectue la requête qu'une seule
   * fois (garde module-scope `loaded`).
   */
  async function refresh(force = false): Promise<void> {
    if (loaded && !force) return
    pending.value = true
    error.value = null
    try {
      status.value = await apiFetch<BridgeStatus>('/api/bridge/status')
      loaded = true
    } catch (err) {
      const message = toApiErrorMessage(err, 'Pont local injoignable.')
      error.value = message
      // Sans pont confirmé, on désactive tout (aucun appel ultérieur ne partira).
      status.value = {
        available: false,
        reason: message,
        devRootPath: null,
      }
    } finally {
      pending.value = false
    }
  }

  /**
   * Déclenche un scan du dossier dev. **Refusé côté client** si le pont est
   * indisponible : aucune requête n'est envoyée.
   */
  async function scan(): Promise<ScanReport> {
    if (!canRunLocal.value) {
      throw new Error(
        status.value?.reason ?? 'Le pont local n’est pas disponible.',
      )
    }
    scanning.value = true
    error.value = null
    try {
      return await apiFetch<ScanReport>('/api/brain/scan', { method: 'POST' })
    } catch (err) {
      const message = toApiErrorMessage(err, 'Le scan du dossier dev a échoué.')
      error.value = message
      throw new Error(message)
    } finally {
      scanning.value = false
    }
  }

  return {
    status: readonly(status),
    pending,
    scanning,
    error,
    canRunLocal,
    refresh,
    scan,
  }
}
