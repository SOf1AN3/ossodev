<script setup lang="ts">
import TaskItem from '~/components/tasks/TaskItem.vue'
import type { TaskWithOverdue } from '~/composables/useTasks'

defineProps<{
  title: string
  tasks: TaskWithOverdue[]
  /**
   * Clé optionnelle exposée en `data-list-key` sur le `<ul>`.
   * Les pages s'en servent pour réaffecter physiquement une ligne
   * d'une liste à l'autre (moment ①) sans casser le rendu de Vue.
   */
  listKey?: string
}>()

const emit = defineEmits<{
  toggle: [task: TaskWithOverdue]
  edit: [task: TaskWithOverdue]
  remove: [task: TaskWithOverdue]
}>()
</script>

<template>
  <section :aria-label="title">
    <h2 class="micro mb-3 text-ink-700">{{ title }}</h2>
    <ul
      class="mb-8 flex max-w-3xl flex-col gap-2"
      :data-list-key="listKey"
    >
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
