<script setup lang="ts">
import UiButton from '~/components/ui/UiButton.vue'
import { formatShortDate, fromISODate } from '~/utils/dates'
import type { TaskWithOverdue } from '~/composables/useTasks'

defineProps<{
  tasks: TaskWithOverdue[]
}>()

const emit = defineEmits<{
  postpone: [task: TaskWithOverdue]
  replan: [task: TaskWithOverdue]
}>()

function overdueSince(task: TaskWithOverdue): string {
  return formatShortDate(fromISODate(task.scheduled_date))
}
</script>

<template>
  <section
    aria-label="Tâches en retard"
    class="rounded-xl border border-danger-400/40 bg-danger-400/10 px-4 py-4"
  >
    <h2 class="text-sm font-medium text-danger-400">
      {{ tasks.length }} tâche{{ tasks.length > 1 ? 's' : '' }} en retard
    </h2>
    <ul class="mt-3 flex flex-col gap-3">
      <li
        v-for="task in tasks"
        :key="task.id"
        class="flex flex-wrap items-center justify-between gap-3"
      >
        <div class="min-w-0">
          <p class="break-words text-sm text-ink-100">{{ task.title }}</p>
          <p class="mt-0.5 text-xs text-ink-300">
            En retard depuis le {{ overdueSince(task) }}
          </p>
        </div>
        <div class="flex shrink-0 items-center gap-2">
          <UiButton size="sm" variant="outline" @click="emit('postpone', task)">
            Reporter demain
          </UiButton>
          <UiButton size="sm" variant="ghost" @click="emit('replan', task)">
            Re-planifier
          </UiButton>
        </div>
      </li>
    </ul>
  </section>
</template>
