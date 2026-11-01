import { ref } from 'vue'
import type { Ref } from 'vue'
import type { LearningCourseSummary, Project, Task } from '~~/shared/types'
import { apiFetch } from './useApi'

// Store réactif partagé (module-scope), même technique que useMobileNav.ts :
// le bouton du Topbar et la palette (montée dans le layout) ne sont pas dans
// le même sous-arbre Vue — un ref local ne suffirait pas à les relier.
const isOpen = ref(false)

// Cache des listes : chargé à la première ouverture seulement, jamais de
// polling ni de requête à chaque frappe (le filtrage est 100 % client).
const projects = ref<Project[]>([])
const tasks = ref<Task[]>([])
const courses = ref<LearningCourseSummary[]>([])
const loading = ref(false)
const loadError = ref<string | null>(null)
let loaded = false

export interface UseCommandPaletteReturn {
  isOpen: Ref<boolean>
  projects: Ref<Project[]>
  tasks: Ref<Task[]>
  courses: Ref<LearningCourseSummary[]>
  loading: Ref<boolean>
  loadError: Ref<string | null>
  open: () => void
  close: () => void
  toggle: () => void
  /** Charge les 3 listes une seule fois (re-tentative si le 1er essai échoue). */
  load: () => Promise<void>
}

export function useCommandPalette(): UseCommandPaletteReturn {
  async function load(): Promise<void> {
    if (loaded || loading.value) return
    loading.value = true
    loadError.value = null
    try {
      const [loadedProjects, loadedTasks, loadedCourses] = await Promise.all([
        apiFetch<Project[]>('/api/projects'),
        apiFetch<Task[]>('/api/tasks'),
        apiFetch<LearningCourseSummary[]>('/api/learning'),
      ])
      projects.value = loadedProjects
      tasks.value = loadedTasks
      courses.value = loadedCourses
      loaded = true
    } catch (err) {
      const message = err instanceof Error ? err.message.trim() : ''
      // Panne réseau : message ofetch illisible → repli français.
      loadError.value =
        message === '' || message === 'fetch failed' || message === 'Failed to fetch'
          ? 'Impossible de charger les résultats.'
          : message
    } finally {
      loading.value = false
    }
  }

  function open(): void {
    isOpen.value = true
    void load()
  }

  function close(): void {
    isOpen.value = false
  }

  function toggle(): void {
    if (isOpen.value) close()
    else open()
  }

  return { isOpen, projects, tasks, courses, loading, loadError, open, close, toggle, load }
}
