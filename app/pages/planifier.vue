<script setup lang="ts">
import UiBadge from '~/components/ui/UiBadge.vue'
import UiButton from '~/components/ui/UiButton.vue'
import UiEmptyState from '~/components/ui/UiEmptyState.vue'
import UiInput from '~/components/ui/UiInput.vue'
import UiSkeleton from '~/components/ui/UiSkeleton.vue'
import DateCalendar from '~/components/tasks/DateCalendar.vue'
import TaskEditor from '~/components/tasks/TaskEditor.vue'
import TaskList from '~/components/tasks/TaskList.vue'
import {
  useTasks,
  type TaskPatch,
  type TaskWithOverdue,
} from '~/composables/useTasks'
import { useToast } from '~/composables/useToast'
import {
  addDays,
  formatLongDate,
  fromISODate,
  startOfWeek,
  toISODate,
} from '~/utils/dates'

useHead({ title: 'Planifier — OSSO' })

const {
  rangeTasks,
  rangePending,
  rangeError,
  loadRange,
  createTask,
  updateTask,
  deleteTask,
  toggleDone,
} = useTasks()

const toast = useToast()

const now = new Date()
const todayIso = toISODate(now)
const weekStartIso = toISODate(startOfWeek(now))
const weekEndIso = toISODate(addDays(startOfWeek(now), 6))
const laterStartIso = toISODate(addDays(startOfWeek(now), 7))

const selectedDate = ref(todayIso)

/** Filtre actif appliqué à la liste de droite. */
type RangeFilter = 'day' | 'tomorrow' | 'week' | 'later'
const filter = ref<RangeFilter>('day')

/** Raccourcis affichés en badges cliquables. */
type ShortcutKey = Exclude<RangeFilter, 'day'>
const shortcuts: ReadonlyArray<{ key: ShortcutKey; label: string }> = [
  { key: 'tomorrow', label: 'Demain' },
  { key: 'week', label: 'Cette semaine' },
  { key: 'later', label: 'Plus tard' },
]

const quickTitle = ref('')
const editingTask = ref<TaskWithOverdue | null>(null)
const editorOpen = ref(false)
const editorSaving = ref(false)

/** Dernière fenêtre visible émise par le calendrier (pour « Réessayer »). */
const lastVisibleRange = ref<{ from: string; to: string } | null>(null)

const dayTasks = computed<TaskWithOverdue[]>(() => {
  if (filter.value === 'tomorrow') {
    const tomorrow = toISODate(addDays(now, 1))
    return rangeTasks.value.filter((task) => task.scheduled_date === tomorrow)
  }
  if (filter.value === 'week') {
    return rangeTasks.value.filter(
      (task) =>
        task.scheduled_date >= weekStartIso &&
        task.scheduled_date <= weekEndIso,
    )
  }
  if (filter.value === 'later') {
    return rangeTasks.value.filter((task) => task.scheduled_date > weekEndIso)
  }
  return rangeTasks.value.filter(
    (task) => task.scheduled_date === selectedDate.value,
  )
})

/** Toutes les dates distinctes portant des tâches (points sur le calendrier). */
const taskDates = computed<string[]>(() => {
  const seen = new Set<string>()
  for (const task of rangeTasks.value) {
    seen.add(task.scheduled_date)
  }
  return [...seen]
})

const selectedLongDate = computed<string>(() =>
  formatLongDate(fromISODate(selectedDate.value)),
)

/** Titre de l'état vide selon le filtre actif. */
const emptyTitle = computed<string>(() => {
  if (filter.value === 'tomorrow') return 'Aucune tâche demain'
  if (filter.value === 'week') return 'Aucune tâche cette semaine'
  if (filter.value === 'later') return 'Aucune tâche plus tard'
  return `Aucune tâche ${selectedLongDate.value}`
})

// Le calendrier émet `rangeChange` à son montage, ce qui déclenche le
// premier `loadRange` : pas de chargement initial à effectuer ici.

function onRangeChange(from: string, to: string): void {
  lastVisibleRange.value = { from, to }
  void loadRange(from, to)
}

function onSelectDay(iso: string): void {
  selectedDate.value = iso
  filter.value = 'day'
}

function applyFilter(next: RangeFilter): void {
  filter.value = next
  if (next === 'tomorrow') selectedDate.value = toISODate(addDays(now, 1))
  if (next === 'week') selectedDate.value = weekStartIso
  if (next === 'later') selectedDate.value = laterStartIso
}

function reportError(err: unknown, fallback: string): void {
  const message = err instanceof Error && err.message ? err.message : fallback
  toast.show({ title: message, tone: 'error' })
}

async function onQuickAdd(): Promise<void> {
  const title = quickTitle.value.trim()
  if (!title) return
  try {
    await createTask({ title, scheduled_date: selectedDate.value })
    quickTitle.value = ''
    toast.show({ title: 'Tâche planifiée', tone: 'success' })
  } catch (err) {
    reportError(err, 'Impossible de planifier la tâche.')
  }
}

async function onToggle(task: TaskWithOverdue): Promise<void> {
  try {
    await toggleDone(task)
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

function onEdit(task: TaskWithOverdue): void {
  editingTask.value = task
  editorOpen.value = true
}

function closeEditor(): void {
  editorOpen.value = false
  editingTask.value = null
}

async function onSaveEditor(patch: TaskPatch): Promise<void> {
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

function listHeading(): string {
  if (filter.value === 'tomorrow') return 'Demain'
  if (filter.value === 'week') return 'Cette semaine'
  if (filter.value === 'later') return 'Plus tard'
  return selectedLongDate.value
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <header class="max-w-3xl">
      <h1 class="text-[30px] font-bold tracking-[-0.03em] text-ink-100">
        Planifier
      </h1>
      <p class="mt-2 text-sm text-ink-300">
        Organise tes tâches à l'avance.
      </p>
    </header>

    <!-- Raccourcis : badges cliquables, état actif en accent -->
    <div
      role="group"
      aria-label="Raccourcis de planification"
      class="flex flex-wrap gap-1.5"
    >
      <button
        v-for="shortcut in shortcuts"
        :key="shortcut.key"
        type="button"
        class="btn p-0.5 focus-visible:outline-2 focus-visible:outline-accent-400"
        :aria-pressed="filter === shortcut.key"
        @click="applyFilter(shortcut.key)"
      >
        <UiBadge :tone="filter === shortcut.key ? 'accent' : 'neutral'">
          {{ shortcut.label }}
        </UiBadge>
      </button>
    </div>

    <!-- Erreur de chargement -->
    <div
      v-if="rangeError"
      class="flex max-w-3xl flex-wrap items-center justify-between gap-3 rounded-md border border-danger-400/40 bg-danger-400/10 px-4 py-3"
      role="alert"
    >
      <p class="text-sm text-danger-400">{{ rangeError }}</p>
      <UiButton
        size="sm"
        variant="outline"
        :disabled="lastVisibleRange === null"
        @click="
          lastVisibleRange
            ? loadRange(lastVisibleRange.from, lastVisibleRange.to)
            : undefined
        "
      >
        Réessayer
      </UiButton>
    </div>

    <div class="grid grid-cols-1 gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
      <!-- Calendrier : semaine lundi → dimanche, surface unique -->
      <DateCalendar
        :model-value="selectedDate"
        :task-dates="taskDates"
        @update:model-value="onSelectDay"
        @range-change="onRangeChange"
      />

      <!-- Liste du jour sélectionné -->
      <div class="flex max-w-3xl flex-col gap-4">
        <div class="flex flex-wrap items-end gap-2">
          <div class="min-w-56 flex-1">
            <UiInput
              v-model="quickTitle"
              :label="`Ajouter le ${selectedLongDate}`"
              placeholder="Nouvelle tâche"
              @enter="onQuickAdd"
            />
          </div>
          <UiButton
            :disabled="quickTitle.trim().length === 0"
            @click="onQuickAdd"
          >
            Planifier
          </UiButton>
        </div>

        <div v-if="rangePending" class="flex flex-col gap-2" aria-busy="true">
          <UiSkeleton class="h-16 w-full" />
          <UiSkeleton class="h-16 w-full" />
          <UiSkeleton class="h-16 w-full" />
        </div>

        <UiEmptyState
          v-else-if="dayTasks.length === 0"
          :title="emptyTitle"
          description="Ajoute une tâche pour l'organiser à l'avance."
        />

        <TaskList
          v-else
          :title="listHeading()"
          :tasks="dayTasks"
          @toggle="onToggle"
          @edit="onEdit"
          @remove="onRemove"
        />
      </div>
    </div>

    <TaskEditor
      :open="editorOpen"
      :task="editingTask"
      :saving="editorSaving"
      @close="closeEditor"
      @save="onSaveEditor"
    />
  </div>
</template>
