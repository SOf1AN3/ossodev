<script setup lang="ts">
import type { ProjectWithCounts } from '~/composables/useProjects'
import ProgressBar from '~/components/gamification/ProgressBar.vue'
import UiBadge from '~/components/ui/UiBadge.vue'

// Mini-carte projet : nom, barre `done / total`, badge « N tâches ouvertes ».
// La carte entière est un lien vers la page du projet.
interface ProjectCardProps {
  project: ProjectWithCounts
}

defineProps<ProjectCardProps>()

function openTasksLabel(project: ProjectWithCounts): string {
  const n = project.open_tasks
  return `${n} tâche${n > 1 ? 's' : ''} ouverte${n > 1 ? 's' : ''}`
}
</script>

<template>
  <NuxtLink
    :to="`/projets/${project.id}`"
    class="group flex flex-col gap-3 rounded-xl border border-line bg-surface-900 p-4 transition-colors hover:bg-surface-800 focus-visible:outline-2 focus-visible:outline-accent-400"
  >
    <div class="flex items-start justify-between gap-3">
      <h3
        class="min-w-0 truncate text-sm font-medium text-ink-100 transition-colors group-hover:text-accent-400"
        :title="project.name"
      >
        {{ project.name }}
      </h3>
      <UiBadge tone="accent" class="shrink-0">
        {{ openTasksLabel(project) }}
      </UiBadge>
    </div>

    <ProgressBar
      :value="project.done_tasks"
      :max="project.task_count"
      :label="`${project.done_tasks} / ${project.task_count} terminées`"
      show-percent
      :aria-label="`Progression de ${project.name}`"
    />

    <p class="truncate text-xs text-ink-500" :title="project.folder_path">
      {{ project.folder_path }}
    </p>
  </NuxtLink>
</template>
