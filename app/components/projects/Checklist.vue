<script setup lang="ts">
import type { ProjectTask } from '~~/shared/types'
import ProjectsChecklistItem from '~/components/projects/ChecklistItem.vue'
import UiButton from '~/components/ui/UiButton.vue'
import UiInput from '~/components/ui/UiInput.vue'

interface ChecklistProps {
  tasks: ProjectTask[]
  pending?: boolean
  /** Verrouille les interactions pendant une écriture serveur. */
  busy?: boolean
}

const props = withDefaults(defineProps<ChecklistProps>(), {
  pending: false,
  busy: false,
})

const emit = defineEmits<{
  toggle: [task: ProjectTask]
  save: [task: ProjectTask, title: string]
  remove: [task: ProjectTask]
  add: [title: string]
  /** Nouvel ordre complet (ids) à envoyer au serveur. */
  reorder: [order: string[]]
}>()

const dragIndex = ref<number | null>(null)
const overIndex = ref<number | null>(null)
const newTitle = ref('')

function dragStateFor(index: number): 'source' | 'target' | null {
  if (dragIndex.value === index) return 'source'
  if (overIndex.value === index && dragIndex.value !== null) return 'target'
  return null
}

function resetDrag(): void {
  dragIndex.value = null
  overIndex.value = null
}

function onDragStart(index: number): void {
  dragIndex.value = index
  overIndex.value = null
}

function onDragEnter(index: number): void {
  if (dragIndex.value === null) return
  overIndex.value = index
}

function onDrop(index: number): void {
  const from = dragIndex.value
  resetDrag()
  if (from === null || from === index) return
  emit('reorder', moveOrder(props.tasks, from, index))
}

function onMove(index: number, direction: -1 | 1): void {
  const target = index + direction
  if (target < 0 || target >= props.tasks.length) return
  emit('reorder', moveOrder(props.tasks, index, target))
}

/** Recalcule la liste des ids après un déplacement de `from` vers `to`. */
function moveOrder(tasks: ProjectTask[], from: number, to: number): string[] {
  const next = [...tasks]
  const [moved] = next.splice(from, 1)
  if (!moved) return tasks.map((task) => task.id)
  next.splice(to, 0, moved)
  return next.map((task) => task.id)
}

function submitNew(): void {
  if (props.busy) return
  const title = newTitle.value.trim()
  if (title === '') return
  emit('add', title)
  newTitle.value = ''
}
</script>

<template>
  <div class="flex flex-col gap-3">
    <h2 class="micro text-ink-500">Checklist</h2>

    <p v-if="pending" class="text-sm text-ink-300" role="status">
      Chargement des tâches…
    </p>

    <p
      v-else-if="tasks.length === 0"
      class="text-sm text-ink-300"
    >
      Aucune tâche pour l’instant — ajoute la première ci-dessous pour
      construire le prompt LEAD.
    </p>

    <ol
      v-else
      class="flex flex-col gap-2"
      aria-label="Liste des tâches du projet"
    >
      <ProjectsChecklistItem
        v-for="(task, index) in tasks"
        :key="task.id"
        :task="task"
        :index="index"
        :total="tasks.length"
        :drag-state="dragStateFor(index)"
        :busy="busy"
        @toggle="emit('toggle', task)"
        @save="(title) => emit('save', task, title)"
        @remove="emit('remove', task)"
        @move="(direction) => onMove(index, direction)"
        @drag-start="onDragStart"
        @drag-enter="onDragEnter"
        @drop="onDrop"
        @drag-end="resetDrag"
      />
    </ol>

    <div class="border-t border-line pt-3">
      <UiInput
        v-model="newTitle"
        label="Ajouter une tâche"
        placeholder="Nouvelle tâche, puis Entrée…"
        @enter="submitNew"
      />
      <div class="mt-2 flex justify-end">
        <UiButton
          size="sm"
          variant="outline"
          :disabled="newTitle.trim() === '' || busy"
          @click="submitNew"
        >
          Ajouter
        </UiButton>
      </div>
    </div>
  </div>
</template>
