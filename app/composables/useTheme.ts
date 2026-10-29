import { computed, readonly, ref } from 'vue'

export type Theme = 'dark' | 'light'

const STORAGE_KEY = 'osso-theme'

/**
 * Gestion du thème sombre / clair.
 *
 * Le `data-theme` est posé sur `<html>` par un script inline dans `nuxt.config.ts`
 * **avant la première peinture** → aucun flash de thème. Ce composable se contente
 * de se synchroniser dessus, puis pilote les bascules.
 *
 * Seul `document.documentElement` porte les variables permutées : aucun composant
 * ne contient de couleur en dur.
 */
const theme = ref<Theme>('dark')
let synced = false

function readDom(): Theme {
  if (!import.meta.client) return 'dark'
  return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark'
}

export function useTheme() {
  const isLight = computed<boolean>(() => theme.value === 'light')

  /** Synchronise l'état réactif avec le DOM (une seule fois par session client). */
  function sync(): void {
    if (!import.meta.client || synced) return
    theme.value = readDom()
    synced = true
  }

  function apply(next: Theme): void {
    theme.value = next
    if (!import.meta.client) return
    document.documentElement.setAttribute('data-theme', next)
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      /* stockage indisponible (navigation privée) : on garde le thème en mémoire */
    }
  }

  function toggle(): void {
    sync()
    apply(theme.value === 'dark' ? 'light' : 'dark')
  }

  return { theme: readonly(theme), isLight, toggle, apply, sync }
}
