<script setup lang="ts">
import UiBadge from '~/components/ui/UiBadge.vue'
import type { TaskWithOverdue } from '~/composables/useTasks'

const props = defineProps<{
  task: TaskWithOverdue
}>()

const emit = defineEmits<{
  toggle: []
  edit: []
  remove: []
}>()

const isDone = computed(() => props.task.status === 'done')

const priorityLabel = computed<string>(() => {
  if (props.task.priority === 1) return 'Priorité haute'
  if (props.task.priority === 3) return 'Priorité basse'
  return 'Priorité normale'
})

const priorityTone = computed<'danger' | 'neutral'>(() =>
  props.task.priority === 1 ? 'danger' : 'neutral',
)

function onToggle(): void {
  emit('toggle')
}
</script>

<template>
  <li
    class="flex items-start gap-3 rounded-xl border border-line bg-surface-900 px-4 py-3"
    :class="isDone ? 'opacity-60' : ''"
  >
    <!-- Case à cocher grande et cliquable -->
    <button
      type="button"
      role="checkbox"
      :aria-checked="isDone"
      :aria-label="isDone ? `Décocher « ${task.title} »` : `Valider « ${task.title} »`"
      class="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border transition-colors focus-visible:outline-2 focus-visible:outline-accent-400"
      :class="
        isDone
          ? 'border-ok-400 bg-ok-400/20 text-ok-400'
          : 'border-line bg-surface-800 text-transparent hover:border-accent-400 hover:bg-surface-700'
      "
      @click="onToggle"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="3"
        stroke-linecap="round"
        stroke-linejoin="round"
        class="h-4 w-4"
        aria-hidden="true"
      >
        <path d="M20 6 9 17l-5-5" />
      </svg>
    </button>

    <div class="min-w-0 flex-1">
      <p
        class="break-words text-sm"
        :class="isDone ? 'text-ink-300 line-through' : 'text-ink-100'"
      >
        {{ task.title }}
      </p>
      <p v-if="task.notes" class="mt-0.5 break-words text-xs text-ink-500">
        {{ task.notes }}
      </p>
      <div class="mt-2 flex flex-wrap items-center gap-2">
        <UiBadge :tone="priorityTone">{{ priorityLabel }}</UiBadge>
        <UiBadge v-if="task.source === 'routine'" tone="accent">Routine</UiBadge>
      </div>
    </div>

    <div class="flex shrink-0 items-center gap-1">
      <button
        type="button"
        :aria-label="`Modifier « ${task.title} »`"
        class="rounded-md p-1.5 text-ink-500 transition-colors hover:bg-surface-800 hover:text-ink-100 focus-visible:outline-2 focus-visible:outline-accent-400"
        @click="emit('edit')"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          class="h-4 w-4"
          aria-hidden="true"
        >
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
        </svg>
      </button>
      <button
        type="button"
        :aria-label="`Supprimer « ${task.title} »`"
        class="rounded-md p-1.5 text-ink-500 transition-colors hover:bg-danger-400/15 hover:text-danger-400 focus-visible:outline-2 focus-visible:outline-accent-400"
        @click="emit('remove')"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          class="h-4 w-4"
          aria-hidden="true"
        >
          <path d="M3 6h18" />
          <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
        </svg>
      </button>
    </div>
  </li>
</template>
