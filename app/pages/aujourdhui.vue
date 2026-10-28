<script setup lang="ts">
import UiButton from '~/components/ui/UiButton.vue'
import UiEmptyState from '~/components/ui/UiEmptyState.vue'
import UiInput from '~/components/ui/UiInput.vue'
import UiSkeleton from '~/components/ui/UiSkeleton.vue'
import RetardBanner from '~/components/tasks/RetardBanner.vue'
import TaskEditor from '~/components/tasks/TaskEditor.vue'
import TaskList from '~/components/tasks/TaskList.vue'
import { useTasks, type TaskPatch, type TaskWithOverdue } from '~/composables/useTasks'
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

const quickTitle = ref('')
const editingTask = ref<TaskWithOverdue | null>(null)
const editorOpen = ref(false)
// `pending` est déjà réservé par useTasks() (chargement de la liste)
const quickAddPending = ref(false)
const editorSaving = ref(false)

const todoTasks = computed<TaskWithOverdue[]>(() =>
  today.value.filter((task) => task.status !== 'done'),
)
const doneTasks = computed<TaskWithOverdue[]>(() =>
  today.value.filter((task) => task.status === 'done'),
)

onMounted(() => {
  void loadToday()
})

function reportError(err: unknown, fallback: string): void {
  const message = err instanceof Error && err.message ? err.message : fallback
  toast.show({ title: message, tone: 'error' })
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

async function onToggle(task: TaskWithOverdue): Promise<void> {
  // État avant bascule : « done » → « todo » = dévalidation (réversible, sans toast)
  const willValidate = task.status !== 'done'
  try {
    await toggleDone(task)
    if (willValidate) {
      toast.show({
        title: 'Tâche validée',
        message: `« ${task.title} »`,
        tone: 'success',
      })
    }
  } catch (err) {
    reportError(err, 'Impossible de mettre à jour la tâche.')
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
    reportError(err, 'Impossible de enregistrer la tâche.')
  } finally {
    editorSaving.value = false
  }
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <header class="flex flex-wrap items-end justify-between gap-2">
      <h1 class="text-2xl font-semibold text-ink-100">{{ longDate }}</h1>
      <p class="text-sm text-ink-300">
        <span class="font-medium text-accent-400">{{ doneTasks.length }}</span>
        / {{ today.length }} tâches
      </p>
    </header>

    <!-- Bandeau de retards : toujours en premier -->
    <RetardBanner
      v-if="overdue.length > 0"
      :tasks="overdue"
      @postpone="onPostpone"
      @replan="onReplan"
    />

    <!-- Création rapide -->
    <form
      class="flex flex-wrap items-end gap-2"
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
      class="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-danger-400/40 bg-danger-400/10 px-4 py-3"
      role="alert"
    >
      <p class="text-sm text-danger-400">{{ error }}</p>
      <UiButton size="sm" variant="outline" @click="loadToday()">
        Réessayer
      </UiButton>
    </div>

    <!-- Chargement -->
    <div v-if="pending" class="flex flex-col gap-2" aria-busy="true">
      <UiSkeleton class="h-16 w-full" />
      <UiSkeleton class="h-16 w-full" />
      <UiSkeleton class="h-16 w-full" />
    </div>

    <!-- Contenu -->
    <template v-else-if="!error">
      <UiEmptyState
        v-if="today.length === 0 && overdue.length === 0"
        icon="☕"
        title="Rien de prévu aujourd'hui. Profites-en."
        description="Ajoute une tâche pour démarrer ta journée."
      />

      <template v-else>
        <TaskList
          v-if="todoTasks.length > 0"
          title="À faire"
          :tasks="todoTasks"
          @toggle="onToggle"
          @edit="onEdit"
          @remove="onRemove"
        />
        <TaskList
          v-if="doneTasks.length > 0"
          title="Validées"
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
      @close="closeEditor"
      @save="onSaveEditor"
    />
  </div>
</template>
