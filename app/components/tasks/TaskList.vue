<script setup lang="ts">
import TaskItem from '~/components/tasks/TaskItem.vue'
import type { TaskWithOverdue } from '~/composables/useTasks'

defineProps<{
  title: string
  tasks: TaskWithOverdue[]
}>()

const emit = defineEmits<{
  toggle: [task: TaskWithOverdue]
  edit: [task: TaskWithOverdue]
  remove: [task: TaskWithOverdue]
}>()
</script>

<template>
  <section :aria-label="title">
    <h2 class="mb-3 text-sm font-medium uppercase tracking-wide text-ink-500">
      {{ title }}
    </h2>
    <ul class="flex flex-col gap-2">
      <TaskItem
        v-for="task in tasks"
        :key="task.id"
        :task="task"
        @toggle="emit('toggle', task)"
        @edit="emit('edit', task)"
        @remove="emit('remove', task)"
      />
    </ul>
  </section>
</template>
