<script setup lang="ts">
import UiIcon from '~/components/ui/UiIcon.vue'
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
    class="max-w-3xl rounded-md border border-danger-400/40 bg-danger-400/10 px-4 py-3.5"
  >
    <div class="flex items-start gap-3">
      <!-- Plaque icône : le signal est porté par la forme, pas par un emoji -->
      <span
        class="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-xs border border-danger-400/40 bg-danger-400/15"
        aria-hidden="true"
      >
        <UiIcon name="clock" class="h-4 w-4 text-danger-400" />
      </span>

      <div class="min-w-0 flex-1">
        <h2 class="text-sm font-medium text-danger-400">
          <span class="tnum">{{ tasks.length }}</span>
          tâche{{ tasks.length > 1 ? 's' : '' }} en retard
        </h2>

        <ul class="mt-3 flex flex-col gap-3">
          <li
            v-for="task in tasks"
            :key="task.id"
            class="flex flex-wrap items-center justify-between gap-3"
          >
            <div class="min-w-0">
              <p class="break-words text-sm text-ink-100">
                {{ task.title }}
              </p>
              <p class="mt-0.5 text-xs text-ink-300">
                En retard depuis le
                <span class="tnum">{{ overdueSince(task) }}</span>
              </p>
            </div>
            <div class="flex shrink-0 items-center gap-1">
              <button
                type="button"
                class="btn rounded-sm px-2.5 py-1 text-xs text-ink-500 hover:bg-surface-800 hover:text-ink-100 focus-visible:outline-2 focus-visible:outline-accent-400"
                @click="emit('postpone', task)"
              >
                Reporter demain
              </button>
              <button
                type="button"
                class="btn rounded-sm px-2.5 py-1 text-xs text-ink-500 hover:bg-surface-800 hover:text-ink-100 focus-visible:outline-2 focus-visible:outline-accent-400"
                @click="emit('replan', task)"
              >
                Re-planifier
              </button>
            </div>
          </li>
        </ul>
      </div>
    </div>
  </section>
</template>
