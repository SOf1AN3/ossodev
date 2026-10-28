import { ref } from 'vue'
import type { Settings } from '~~/shared/types'
import { apiFetch } from './useApi'

const EMPTY_SETTINGS: Settings = {
  leadIntroTemplate: '',
  brainCommand: '',
  terminalCommand: '',
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

export function useSettings() {
  const settings = ref<Settings>({ ...EMPTY_SETTINGS })
  const pending = ref(false)
  const saving = ref(false)
  const error = ref<string | null>(null)

  async function load(): Promise<Settings> {
    pending.value = true
    error.value = null
    try {
      settings.value = await apiFetch<Settings>('/api/settings')
      return settings.value
    } catch (err) {
      const message = toApiErrorMessage(
        err,
        'Impossible de charger les réglages.',
      )
      error.value = message
      throw new Error(message)
    } finally {
      pending.value = false
    }
  }

  async function save(input: Settings): Promise<Settings> {
    saving.value = true
    error.value = null
    try {
      settings.value = await apiFetch<Settings>('/api/settings', {
        method: 'PUT',
        body: input,
      })
      return settings.value
    } catch (err) {
      const message = toApiErrorMessage(
        err,
        'Impossible d’enregistrer les réglages.',
      )
      error.value = message
      throw new Error(message)
    } finally {
      saving.value = false
    }
  }

  return {
    settings,
    pending,
    saving,
    error,
    load,
    save,
  }
}
