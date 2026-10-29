<script setup lang="ts">
import UiBadge from '~/components/ui/UiBadge.vue'
import UiIcon from '~/components/ui/UiIcon.vue'
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
  <!-- .task porte le moment ① (pop / done) ; .box et .strike sont tracés dans main.css -->
  <li
    class="task flex items-start gap-3 rounded-md border border-line bg-surface-800 px-4 py-3.5 hover:bg-surface-700"
    :class="isDone ? 'done' : ''"
    :data-task-id="task.id"
  >
    <!-- Case à cocher : la hit-area est agrandie sans décaler la ligne -->
    <button
      type="button"
      role="checkbox"
      :aria-checked="isDone"
      :aria-label="
        isDone ? `Décocher « ${task.title} »` : `Valider « ${task.title} »`
      "
      class="-my-1 flex shrink-0 items-center justify-center rounded-xs p-1 focus-visible:outline-2 focus-visible:outline-accent-400"
      @click="onToggle"
    >
      <span class="box" aria-hidden="true">
        <svg viewBox="0 0 24 24" focusable="false">
          <path d="M20 6 9 17l-5-5" />
        </svg>
      </span>
    </button>

    <div class="min-w-0 flex-1">
      <p class="break-words text-sm text-ink-100">
        <span class="strike">{{ task.title }}</span>
      </p>
      <p v-if="task.notes" class="mt-1 break-words text-xs text-ink-500">
        {{ task.notes }}
      </p>
      <div class="mt-2 flex flex-wrap items-center gap-2">
        <UiBadge :tone="priorityTone">{{ priorityLabel }}</UiBadge>
        <UiBadge v-if="task.source === 'routine'" tone="accent">
          Routine
        </UiBadge>
        <span class="micro text-ink-700">
          <span class="tnum">{{ task.points }}</span> pts
        </span>
      </div>
    </div>

    <div class="flex shrink-0 items-center gap-1">
      <button
        type="button"
        :aria-label="`Modifier « ${task.title} »`"
        class="rounded-xs p-1.5 text-ink-500 transition-colors hover:bg-surface-700 hover:text-ink-100 focus-visible:outline-2 focus-visible:outline-accent-400"
        @click="emit('edit')"
      >
        <UiIcon name="pencil" />
      </button>
      <button
        type="button"
        :aria-label="`Supprimer « ${task.title} »`"
        class="rounded-xs p-1.5 text-ink-500 transition-colors hover:bg-danger-400/15 hover:text-danger-400 focus-visible:outline-2 focus-visible:outline-accent-400"
        @click="emit('remove')"
      >
        <UiIcon name="trash" />
      </button>
    </div>
  </li>
</template>
