<script setup lang="ts">
import type { ProjectTask } from '~~/shared/types'
import UiButton from '~/components/ui/UiButton.vue'
import UiInput from '~/components/ui/UiInput.vue'

interface ChecklistItemProps {
  task: ProjectTask
  index: number
  total: number
  /** État visuel pendant un drag & drop natif. */
  dragState?: 'source' | 'target' | null
  /** Verrouille les interactions pendant une écriture serveur. */
  busy?: boolean
}

const props = withDefaults(defineProps<ChecklistItemProps>(), {
  dragState: null,
  busy: false,
})

const emit = defineEmits<{
  toggle: []
  save: [title: string]
  remove: []
  /** Déplacement d'un cran vers le haut (-1) ou le bas (+1) — fallback clavier. */
  move: [direction: -1 | 1]
  dragStart: [index: number]
  dragEnter: [index: number]
  drop: [index: number]
  dragEnd: []
}>()

const editing = ref(false)
const draft = ref('')
const confirmingDelete = ref(false)
const editWrapRef = ref<HTMLDivElement | null>(null)

function startEdit(): void {
  if (props.busy) return
  confirmingDelete.value = false
  draft.value = props.task.title
  editing.value = true
  nextTick(() => {
    editWrapRef.value?.querySelector('input')?.focus()
  })
}

function commitEdit(): void {
  if (!editing.value) return
  const title = draft.value.trim()
  editing.value = false
  if (title === '' || title === props.task.title) return
  emit('save', title)
}

function cancelEdit(): void {
  editing.value = false
  draft.value = props.task.title
}

function onEditKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.preventDefault()
    cancelEdit()
  }
}

function onDragStart(event: DragEvent): void {
  if (props.busy || editing.value) return
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', String(props.index))
  }
  emit('dragStart', props.index)
}

function onDragEnter(): void {
  emit('dragEnter', props.index)
}

function onDrop(): void {
  emit('drop', props.index)
}

function checkboxLabel(): string {
  return props.task.is_done
    ? `Replacer « ${props.task.title} » dans la liste à faire`
    : `Marquer « ${props.task.title} » comme faite`
}
</script>

<template>
  <li
    :draggable="!editing && !busy"
    class="group flex items-center gap-3 rounded-lg border border-line bg-surface-900 px-3 py-2 transition-colors hover:bg-surface-800"
    :class="{
      'opacity-40': dragState === 'source',
      'border-accent-400 bg-surface-800': dragState === 'target',
    }"
    @dragstart="onDragStart"
    @dragenter.prevent="onDragEnter"
    @dragover.prevent
    @drop.prevent="onDrop"
    @dragend="emit('dragEnd')"
  >
    <!-- Poignée de drag (visuelle) -->
    <span
      class="cursor-grab text-ink-500 select-none"
      aria-hidden="true"
      title="Glisser pour réordonner"
    >
      ⠿
    </span>

    <input
      type="checkbox"
      :checked="task.is_done"
      :disabled="busy"
      :aria-label="checkboxLabel()"
      class="h-4 w-4 shrink-0 cursor-pointer accent-accent-400 focus-visible:outline-2 focus-visible:outline-accent-400"
      @change="emit('toggle')"
    >

    <!-- Édition inline -->
    <div
      v-if="editing"
      ref="editWrapRef"
      class="min-w-0 flex-1"
      @keydown="onEditKeydown"
    >
      <UiInput
        v-model="draft"
        placeholder="Titre de la tâche"
        aria-label="Nouveau titre de la tâche"
        @enter="commitEdit"
      />
    </div>

    <!-- Titre (clic = édition) -->
    <button
      v-else
      type="button"
      class="min-w-0 flex-1 truncate rounded text-left text-sm focus-visible:outline-2 focus-visible:outline-accent-400"
      :class="task.is_done ? 'text-ink-500 line-through' : 'text-ink-100'"
      :title="`Cliquer pour modifier : ${task.title}`"
      :disabled="busy"
      @click="startEdit"
    >
      {{ task.title }}
    </button>

    <!-- Actions -->
    <div class="flex shrink-0 items-center gap-1">
      <template v-if="editing">
        <UiButton size="sm" @click="commitEdit">Valider</UiButton>
        <UiButton size="sm" variant="ghost" @click="cancelEdit">
          Annuler
        </UiButton>
      </template>

      <template v-else-if="confirmingDelete">
        <span class="text-xs text-danger-400">Supprimer ?</span>
        <UiButton size="sm" variant="danger" @click="emit('remove')">
          Confirmer
        </UiButton>
        <UiButton
          size="sm"
          variant="ghost"
          @click="confirmingDelete = false"
        >
          Annuler
        </UiButton>
      </template>

      <template v-else>
        <!-- Fallback clavier au drag & drop -->
        <div
          class="flex items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100"
        >
          <button
            type="button"
            class="rounded-md px-1.5 py-1 text-ink-500 transition-colors hover:bg-surface-700 hover:text-ink-100 focus-visible:outline-2 focus-visible:outline-accent-400 disabled:opacity-30"
            :disabled="index === 0 || busy"
            aria-label="Monter la tâche dans la liste"
            @click="emit('move', -1)"
          >
            <span aria-hidden="true">↑</span>
          </button>
          <button
            type="button"
            class="rounded-md px-1.5 py-1 text-ink-500 transition-colors hover:bg-surface-700 hover:text-ink-100 focus-visible:outline-2 focus-visible:outline-accent-400 disabled:opacity-30"
            :disabled="index === total - 1 || busy"
            aria-label="Descendre la tâche dans la liste"
            @click="emit('move', 1)"
          >
            <span aria-hidden="true">↓</span>
          </button>
        </div>
        <button
          type="button"
          class="rounded-md px-1.5 py-1 text-ink-500 opacity-0 transition-opacity hover:bg-danger-400/15 hover:text-danger-400 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-danger-400 group-hover:opacity-100 disabled:opacity-30"
          :disabled="busy"
          aria-label="Supprimer la tâche"
          @click="confirmingDelete = true"
        >
          <span aria-hidden="true">🗑</span>
        </button>
      </template>
    </div>
  </li>
</template>
