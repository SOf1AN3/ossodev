<script setup lang="ts">
import UiButton from '~/components/ui/UiButton.vue'
import UiEmptyState from '~/components/ui/UiEmptyState.vue'
import UiInput from '~/components/ui/UiInput.vue'
import UiSkeleton from '~/components/ui/UiSkeleton.vue'
import RetardBanner from '~/components/tasks/RetardBanner.vue'
import TaskEditor from '~/components/tasks/TaskEditor.vue'
import TaskList from '~/components/tasks/TaskList.vue'
import {
  useTasks,
  type TaskPatch,
  type TaskWithOverdue,
} from '~/composables/useTasks'
import { useToast } from '~/composables/useToast'
import { addDays, formatLongDate, toISODate } from '~/utils/dates'

useHead({ title: "Aujourd'hui — OSSO" })

const {
  today,
  overdue,
  pending,
  error,
  loadToday,
  createTask,
  updateTask,
  deleteTask,
  moveTask,
  toggleDone,
} = useTasks()

const toast = useToast()

const now = new Date()
const todayIso = toISODate(now)
const tomorrowIso = toISODate(addDays(now, 1))
const longDate = formatLongDate(now)

/** Racine de la page : localise lignes et listes pour le moment ①. */
const pageRef = ref<HTMLElement | null>(null)

const quickTitle = ref('')
const editingTask = ref<TaskWithOverdue | null>(null)
const editorOpen = ref(false)
// `pending` est déjà réservé par useTasks() (chargement de la liste)
const quickAddPending = ref(false)
const editorSaving = ref(false)

/** Tâches dont la bascule est en vol : anti double-clic → un seul toast. */
const inFlight = new Set<string>()

const todoTasks = computed<TaskWithOverdue[]>(() =>
  today.value.filter((task) => task.status !== 'done'),
)
const doneTasks = computed<TaskWithOverdue[]>(() =>
  today.value.filter((task) => task.status === 'done'),
)
/** Une tâche validée, même d'hier, n'est jamais un retard. */
const overdueTasks = computed<TaskWithOverdue[]>(() =>
  overdue.value.filter((task) => task.status !== 'done'),
)

onMounted(() => {
  void loadToday()
})

function reportError(err: unknown, fallback: string): void {
  const message = err instanceof Error && err.message ? err.message : fallback
  toast.show({ title: message, tone: 'error' })
}

/** Ligne `<li data-task-id>` correspondant à une tâche, où qu'elle soit. */
function findRow(taskId: string): HTMLElement | null {
  const root = pageRef.value
  if (root === null) return null
  const rows = root.querySelectorAll<HTMLElement>('[data-task-id]')
  for (const row of rows) {
    if (row.dataset.taskId === taskId) return row
  }
  return null
}

/** `<ul data-list-key="…">` de l'une des deux colonnes. */
function listEl(key: 'todo' | 'done'): HTMLElement | null {
  return (
    pageRef.value?.querySelector<HTMLElement>(`ul[data-list-key="${key}"]`) ??
    null
  )
}

async function onQuickAdd(): Promise<void> {
  // Garde-fou contre les double-soumissions (clic + `enter` synchrones)
  if (quickAddPending.value) return
  const title = quickTitle.value.trim()
  if (!title) return
  quickAddPending.value = true
  try {
    await createTask({ title, scheduled_date: todayIso })
    quickTitle.value = ''
    toast.show({ title: 'Tâche ajoutée', tone: 'success' })
  } catch (err) {
    reportError(err, "Impossible d'ajouter la tâche.")
  } finally {
    quickAddPending.value = false
  }
}

/**
 * Moment ① — bascule d'une tâche.
 * Au clic : `.pop`, la ligne est réellement réaffectée (appendChild) de
 * « À faire » vers « Validées », `useTasks` est mis à jour, puis le toast
 * de succès part. La dévalidation est réversible : aucun toast.
 */
async function onToggle(task: TaskWithOverdue): Promise<void> {
  if (inFlight.has(task.id)) return
  inFlight.add(task.id)

  const willValidate = task.status !== 'done'
  const row = findRow(task.id)
  const doneList = willValidate ? listEl('done') : null
  const moved = row !== null && doneList !== null

  try {
    if (row !== null && doneList !== null) {
      doneList.appendChild(row)
      row.classList.add('done', 'pop')
    } else if (row !== null && !willValidate) {
      // Dévalidation : la ligne rebondit sur place avant de rejoindre « À faire ».
      row.classList.add('pop')
    }

    await toggleDone(task)

    if (!willValidate) return

    if (!moved) {
      // Première validation du jour : la liste « Validées » vient d'être
      // montée, le pop doit viser la ligne que Vue a réellement insérée.
      await nextTick()
      findRow(task.id)?.classList.add('pop')
    }

    toast.show({
      title: 'Tâche validée',
      message: `« ${task.title} » · +${task.points} pts`,
      tone: 'success',
    })
  } catch (err) {
    if (moved && row !== null) {
      const todoList = listEl('todo')
      if (todoList !== null) {
        todoList.appendChild(row)
        row.classList.remove('done', 'pop')
      }
    }
    reportError(err, 'Impossible de mettre à jour la tâche.')
  } finally {
    inFlight.delete(task.id)
  }
}

async function onRemove(task: TaskWithOverdue): Promise<void> {
  try {
    await deleteTask(task.id)
    toast.show({ title: 'Tâche supprimée', tone: 'success' })
  } catch (err) {
    reportError(err, 'Impossible de supprimer la tâche.')
  }
}

async function onPostpone(task: TaskWithOverdue): Promise<void> {
  try {
    await moveTask(task.id, tomorrowIso)
    toast.show({ title: 'Tâche reportée à demain', tone: 'success' })
  } catch (err) {
    reportError(err, 'Impossible de reporter la tâche.')
  }
}

function onReplan(task: TaskWithOverdue): void {
  editingTask.value = task
  editorOpen.value = true
}

function onEdit(task: TaskWithOverdue): void {
  editingTask.value = task
  editorOpen.value = true
}

function closeEditor(): void {
  editorOpen.value = false
  editingTask.value = null
}

async function onSaveEditor(patch: TaskPatch): Promise<void> {
  // Garde-fou contre les double-soumissions de l'éditeur
  if (editorSaving.value) return
  if (!editingTask.value) return
  editorSaving.value = true
  try {
    await updateTask(editingTask.value.id, patch)
    toast.show({ title: 'Tâche mise à jour', tone: 'success' })
    closeEditor()
  } catch (err) {
    reportError(err, "Impossible d'enregistrer la tâche.")
  } finally {
    editorSaving.value = false
  }
}
</script>

<template>
  <div ref="pageRef" class="flex flex-col gap-6">
    <!-- Colonne d'exécution : tout le contenu est borné à 768px -->
    <header class="max-w-3xl">
      <p class="micro text-ink-700">{{ longDate }}</p>
      <h1
        class="mt-2 text-[30px] font-bold tracking-[-0.03em] text-ink-100"
      >
        Aujourd'hui
      </h1>
      <p class="mt-2 text-sm text-ink-500">
        <span class="tnum font-medium text-accent-400">
          {{ doneTasks.length }}
        </span>
        <span class="tnum"> / {{ today.length }}</span> tâches
      </p>
    </header>

    <!-- Bandeau de retards : toujours en premier, jamais de tâche validée dedans -->
    <RetardBanner
      v-if="overdueTasks.length > 0"
      :tasks="overdueTasks"
      @postpone="onPostpone"
      @replan="onReplan"
    />

    <!-- Création rapide -->
    <form
      class="flex max-w-3xl flex-wrap items-end gap-2"
      :aria-busy="quickAddPending"
      @submit.prevent="onQuickAdd"
    >
      <div class="min-w-56 flex-1">
        <UiInput
          v-model="quickTitle"
          label="Ajout rapide"
          placeholder="Que veux-tu faire aujourd'hui ?"
          :disabled="quickAddPending"
          @enter="onQuickAdd"
        />
      </div>
      <UiButton
        type="submit"
        :disabled="quickAddPending || quickTitle.trim().length === 0"
      >
        {{ quickAddPending ? 'Ajout en cours…' : 'Ajouter' }}
      </UiButton>
    </form>

    <!-- Erreur -->
    <div
      v-if="error"
      class="flex max-w-3xl flex-wrap items-center justify-between gap-3 rounded-md border border-danger-400/40 bg-danger-400/10 px-4 py-3"
      role="alert"
    >
      <p class="text-sm text-danger-400">{{ error }}</p>
      <UiButton size="sm" variant="outline" @click="loadToday()">
        Réessayer
      </UiButton>
    </div>

    <!-- Chargement -->
    <div v-if="pending" class="flex flex-col gap-2" aria-busy="true">
      <UiSkeleton class="h-16 w-full max-w-3xl" />
      <UiSkeleton class="h-16 w-full max-w-3xl" />
      <UiSkeleton class="h-16 w-full max-w-3xl" />
    </div>

    <!-- Contenu -->
    <template v-else-if="!error">
      <UiEmptyState
        v-if="today.length === 0 && overdueTasks.length === 0"
        title="Rien de prévu aujourd'hui. Profites-en."
        description="Ajoute une tâche pour démarrer ta journée."
      />

      <template v-else>
        <TaskList
          v-if="todoTasks.length > 0"
          title="À faire"
          list-key="todo"
          :tasks="todoTasks"
          @toggle="onToggle"
          @edit="onEdit"
          @remove="onRemove"
        />
        <TaskList
          v-if="doneTasks.length > 0"
          title="Validées"
          list-key="done"
          :tasks="doneTasks"
          @toggle="onToggle"
          @edit="onEdit"
          @remove="onRemove"
        />
      </template>
    </template>

    <TaskEditor
      :open="editorOpen"
      :task="editingTask"
      :saving="editorSaving"
      @close="closeEditor"
      @save="onSaveEditor"
    />
  </div>
</template>
