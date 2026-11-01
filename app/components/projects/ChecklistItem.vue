<script setup lang="ts">
import type { ProjectTaskNode } from '~~/shared/types'
// Auto-import récursif : Vue résout le composant par lui-même au rendu.
import ChecklistItem from '~/components/projects/ChecklistItem.vue'
import UiButton from '~/components/ui/UiButton.vue'
import UiIcon from '~/components/ui/UiIcon.vue'

interface ChecklistItemProps {
  task: ProjectTaskNode
  /** Profondeur réelle dans l'arbre (aria-level) — 1 = racine. */
  level: number
  /** Index parmi les frères — drag & drop / déplacement racine. */
  index?: number
  total?: number
  /** État visuel pendant un drag & drop natif (racine uniquement). */
  dragState?: 'source' | 'target' | null
  /** Verrouille les interactions pendant une écriture serveur. */
  busy?: boolean
}

const props = withDefaults(defineProps<ChecklistItemProps>(), {
  index: undefined,
  total: undefined,
  dragState: null,
  busy: false,
})

const emit = defineEmits<{
  toggle: [task: ProjectTaskNode]
  save: [task: ProjectTaskNode, title: string]
  remove: [task: ProjectTaskNode]
  add: [title: string, parentId: string | null]
  /** Racine uniquement : déplacement d'un cran vers le haut (-1) ou le bas (+1). */
  move: [direction: -1 | 1]
  dragStart: [index: number]
  dragEnter: [index: number]
  drop: [index: number]
  dragEnd: []
}>()

/** `edit` = renommer la tâche, `add` = créer une fille sous elle. */
const draftMode = ref<'edit' | 'add' | null>(null)
const draft = ref('')
const confirmingDelete = ref(false)
const inputRef = ref<HTMLInputElement | null>(null)

const isRoot = computed<boolean>(() => props.level === 1)

/** « + Sous-tâche » à la racine, « + Sous-sous-tâche » dès aria-level ≥ 2. */
const addChildLabel = computed<string>(() =>
  props.level >= 2 ? '+ Sous-sous-tâche' : '+ Sous-tâche',
)

const moveUpDisabled = computed<boolean>(() => props.busy || (props.index ?? 1) <= 0)
const moveDownDisabled = computed<boolean>(() => {
  if (props.busy || props.index === undefined || props.total === undefined) return true
  return props.index >= props.total - 1
})

function startEdit(): void {
  if (props.busy) return
  confirmingDelete.value = false
  draft.value = props.task.title
  draftMode.value = 'edit'
  void nextTick(() => {
    inputRef.value?.focus()
    inputRef.value?.select()
  })
}

function startAddChild(): void {
  if (props.busy) return
  confirmingDelete.value = false
  draft.value = ''
  draftMode.value = 'add'
  void nextTick(() => inputRef.value?.focus())
}

function commitDraft(): void {
  const title = draft.value.trim()
  if (draftMode.value === 'edit') {
    draftMode.value = null
    if (title === '' || title === props.task.title) return
    emit('save', props.task, title)
    return
  }
  if (draftMode.value === 'add') {
    draftMode.value = null
    if (title === '') return
    emit('add', title, props.task.id)
  }
}

function cancelDraft(): void {
  draftMode.value = null
  draft.value = props.task.title
}

function onDraftKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.preventDefault()
    cancelDraft()
  } else if (event.key === 'Enter') {
    event.preventDefault()
    commitDraft()
  }
}

// ─── Drag & drop (racine uniquement — les enfants ne réordonnent pas) ────────
// Les enfants n'ont ni poignée ni handlers : leurs événements pointent vers
// l'ancêtre racine qui, elle, porte les handlers (la bulle remonte).

function onDragStart(event: DragEvent): void {
  if (!isRoot.value || props.index === undefined || props.busy || draftMode.value !== null) return
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', String(props.index))
  }
  emit('dragStart', props.index)
}

function onDragEnter(event: DragEvent): void {
  if (!isRoot.value || props.index === undefined) return
  event.preventDefault()
  emit('dragEnter', props.index)
}

function onDragOver(event: DragEvent): void {
  // Seule la racine accepte le dépôt : sans `preventDefault` ici (même si un
  // enfant remonte l'événement), le dragover n'est pas annulé → pas de drop.
  if (!isRoot.value) return
  event.preventDefault()
}

function onDrop(event: DragEvent): void {
  if (!isRoot.value || props.index === undefined) return
  event.preventDefault()
  emit('drop', props.index)
}

function checkboxLabel(): string {
  return props.task.is_done
    ? `Replacer « ${props.task.title} » dans la liste à faire`
    : `Marquer « ${props.task.title} » comme faite`
}

// ─── Remontée des événements des descendants (la tâche cible voyage) ─────────

function forwardToggle(task: ProjectTaskNode): void {
  emit('toggle', task)
}

function forwardSave(task: ProjectTaskNode, title: string): void {
  emit('save', task, title)
}

function forwardRemove(task: ProjectTaskNode): void {
  emit('remove', task)
}

function forwardAdd(title: string, parentId: string | null): void {
  emit('add', title, parentId)
}
</script>

<template>
  <li
    role="treeitem"
    :aria-level="level"
    :aria-expanded="task.children.length > 0 ? true : undefined"
    :aria-checked="task.is_done"
    class="flex flex-col"
    :class="isRoot && dragState === 'source' ? 'opacity-40' : ''"
    @dragstart="onDragStart"
    @dragenter="onDragEnter"
    @dragover="onDragOver"
    @drop="onDrop"
    @dragend="emit('dragEnd')"
  >
    <!-- Ligne de tâche — `.task`/`.done` pilotent la case et le barré (CSS) -->
    <div
      class="task group flex items-center gap-3 rounded-xs border border-transparent bg-surface-900 px-3 py-2.5"
      :class="[
        task.is_done ? 'done' : 'hover:bg-surface-700',
        isRoot && dragState === 'target' ? 'border-accent-400 bg-surface-700' : '',
      ]"
      :draggable="isRoot && draftMode === null && !busy"
    >
      <!-- Poignée de drag (visuelle, sans glyphe) — racine uniquement -->
      <span
        v-if="isRoot"
        class="grid shrink-0 cursor-grab select-none grid-cols-2 gap-[2px] opacity-60"
        aria-hidden="true"
        title="Glisser pour réordonner"
      >
        <span v-for="n in 6" :key="n" class="block h-[3px] w-[3px] rounded-full bg-ink-700" />
      </span>

      <!-- Case qui se dessine (.box) -->
      <!-- `.box` est hors-layer dans main.css : hover sur le fond (non conflictuel) -->
      <button
        type="button"
        class="box cursor-pointer bg-transparent p-0 hover:bg-surface-600 disabled:opacity-40"
        :aria-label="checkboxLabel()"
        :disabled="busy"
        @click="emit('toggle', task)"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="m5 12.6 4.6 4.6L19 7.4" />
        </svg>
      </button>

      <!-- Édition inline / saisie d'une sous-tâche -->
      <div v-if="draftMode !== null" class="min-w-0 flex-1">
        <div class="field">
          <input
            ref="inputRef"
            v-model="draft"
            type="text"
            :aria-label="
              draftMode === 'edit' ? 'Nouveau titre de la tâche' : 'Titre de la sous-tâche'
            "
            :placeholder="draftMode === 'edit' ? 'Titre de la tâche' : 'Titre de la sous-tâche'"
            class="w-full rounded-sm border border-line bg-surface-800 px-2.5 py-1.5 text-sm"
            :class="
              draftMode === 'edit' && task.is_done ? 'text-ink-500 line-through' : 'text-ink-100'
            "
            @keydown="onDraftKeydown"
          />
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
        <template v-if="draftMode !== null">
          <UiButton size="sm" @click="commitDraft">Valider</UiButton>
          <UiButton size="sm" variant="ghost" @click="cancelDraft"> Annuler </UiButton>
        </template>

        <template v-else-if="confirmingDelete">
          <span class="text-xs text-danger-400">Supprimer ?</span>
          <UiButton size="sm" variant="danger" @click="emit('remove', task)"> Confirmer </UiButton>
          <UiButton size="sm" variant="ghost" @click="confirmingDelete = false"> Annuler </UiButton>
        </template>

        <template v-else>
          <!-- Fallback clavier au drag & drop — racine uniquement -->
          <div
            v-if="isRoot"
            class="flex items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100"
          >
            <button
              type="button"
              class="rounded-xs p-1.5 text-ink-500 transition-colors hover:bg-surface-800 hover:text-ink-100 disabled:opacity-30"
              :disabled="moveUpDisabled"
              aria-label="Monter la tâche dans la liste"
              title="Monter"
              @click="emit('move', -1)"
            >
              <UiIcon name="arrowUp" size="sm" />
            </button>
            <button
              type="button"
              class="rounded-xs p-1.5 text-ink-500 transition-colors hover:bg-surface-800 hover:text-ink-100 disabled:opacity-30"
              :disabled="moveDownDisabled"
              aria-label="Descendre la tâche dans la liste"
              title="Descendre"
              @click="emit('move', 1)"
            >
              <UiIcon name="arrowDown" size="sm" />
            </button>
          </div>

          <!-- Ajouter une fille : libellé contextuel selon la profondeur -->
          <button
            type="button"
            class="rounded-xs px-2 py-1 text-xs text-ink-500 opacity-0 transition-opacity hover:bg-surface-800 hover:text-ink-100 focus-visible:opacity-100 group-hover:opacity-100 disabled:opacity-30"
            :disabled="busy"
            :title="addChildLabel"
            @click="startAddChild"
          >
            {{ addChildLabel }}
          </button>

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
    </div>

    <!-- Descendants : `pl-5` + filet vertical par niveau, profondeur illimitée -->
    <ul
      v-if="task.children.length > 0"
      role="group"
      class="mt-1 ml-2 flex flex-col gap-1 border-l border-line pl-5"
    >
      <ChecklistItem
        v-for="(child, childIndex) in task.children"
        :key="child.id"
        :task="child"
        :level="level + 1"
        :index="childIndex"
        :total="task.children.length"
        :busy="busy"
        @toggle="forwardToggle"
        @save="forwardSave"
        @remove="forwardRemove"
        @add="forwardAdd"
      />
    </ul>
  </li>
</template>
