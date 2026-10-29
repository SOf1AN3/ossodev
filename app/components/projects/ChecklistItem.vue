<script setup lang="ts">
import type { ProjectTask } from '~~/shared/types'
import UiButton from '~/components/ui/UiButton.vue'
import UiIcon from '~/components/ui/UiIcon.vue'

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
const editInputRef = ref<HTMLInputElement | null>(null)

function startEdit(): void {
  if (props.busy) return
  confirmingDelete.value = false
  draft.value = props.task.title
  editing.value = true
  void nextTick(() => {
    editInputRef.value?.focus()
    editInputRef.value?.select()
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
  } else if (event.key === 'Enter') {
    event.preventDefault()
    commitEdit()
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
    class="task group flex items-center gap-3 rounded-xs border border-transparent bg-surface-900 px-3 py-2.5"
    :class="[
      task.is_done ? 'done' : 'hover:bg-surface-700',
      dragState === 'source' ? 'opacity-40' : '',
      dragState === 'target' ? 'border-accent-400 bg-surface-700' : '',
    ]"
    @dragstart="onDragStart"
    @dragenter.prevent="onDragEnter"
    @dragover.prevent
    @drop.prevent="onDrop"
    @dragend="emit('dragEnd')"
  >
    <!-- Poignée de drag (visuelle, sans glyphe) -->
    <span
      class="grid shrink-0 cursor-grab select-none grid-cols-2 gap-[2px] opacity-60"
      aria-hidden="true"
      title="Glisser pour réordonner"
    >
      <span
        v-for="n in 6"
        :key="n"
        class="block h-[3px] w-[3px] rounded-full bg-ink-700"
      />
    </span>

    <!-- Case qui se dessine (.box) -->
    <!-- `.box` est hors-layer dans main.css : hover sur le fond (non conflictuel) -->
    <button
      type="button"
      class="box cursor-pointer bg-transparent p-0 hover:bg-surface-600 disabled:opacity-40"
      :aria-label="checkboxLabel()"
      :disabled="busy"
      @click="emit('toggle')"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="m5 12.6 4.6 4.6L19 7.4" />
      </svg>
    </button>

    <!-- Édition inline — le barré est conservé si la tâche est faite -->
    <div v-if="editing" class="min-w-0 flex-1">
      <div class="field">
        <input
          ref="editInputRef"
          v-model="draft"
          type="text"
          aria-label="Nouveau titre de la tâche"
          placeholder="Titre de la tâche"
          class="w-full rounded-sm border border-line bg-surface-800 px-2.5 py-1.5 text-sm"
          :class="task.is_done ? 'text-ink-500 line-through' : 'text-ink-100'"
          @keydown="onEditKeydown"
        >
      </div>
    </div>

    <!-- Titre (clic = édition) — le barré se trace (.strike) -->
    <button
      v-else
      type="button"
      class="flex min-w-0 flex-1 items-center rounded-xs text-left text-sm"
      :title="`Cliquer pour modifier : ${task.title}`"
      :disabled="busy"
      @click="startEdit"
    >
      <span
        class="strike min-w-0 flex-1 truncate"
        :class="task.is_done ? 'text-ink-500' : 'text-ink-100'"
      >
        {{ task.title }}
      </span>
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
            class="rounded-xs p-1.5 text-ink-500 transition-colors hover:bg-surface-800 hover:text-ink-100 disabled:opacity-30"
            :disabled="index === 0 || busy"
            aria-label="Monter la tâche dans la liste"
            title="Monter"
            @click="emit('move', -1)"
          >
            <UiIcon name="arrowUp" size="sm" />
          </button>
          <button
            type="button"
            class="rounded-xs p-1.5 text-ink-500 transition-colors hover:bg-surface-800 hover:text-ink-100 disabled:opacity-30"
            :disabled="index === total - 1 || busy"
            aria-label="Descendre la tâche dans la liste"
            title="Descendre"
            @click="emit('move', 1)"
          >
            <UiIcon name="arrowDown" size="sm" />
          </button>
        </div>
        <button
          type="button"
          class="rounded-xs p-1.5 text-ink-500 opacity-0 transition-opacity hover:bg-surface-800 hover:text-danger-400 focus-visible:opacity-100 group-hover:opacity-100 disabled:opacity-30"
          :disabled="busy"
          aria-label="Supprimer la tâche"
          title="Supprimer"
          @click="confirmingDelete = true"
        >
          <UiIcon name="trash" size="sm" />
        </button>
      </template>
    </div>
  </li>
</template>
