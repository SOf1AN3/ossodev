<script setup lang="ts">
import type { ProjectWithCounts } from '~/composables/useProjects'
import UiBadge from '~/components/ui/UiBadge.vue'
import UiIcon from '~/components/ui/UiIcon.vue'

// Mini-carte projet : plaque dossier, nom, chemin mono, mini-barre
// `done / total` et badge « N ouvertes ». La carte est un lien complet.
interface ProjectCardProps {
  project: ProjectWithCounts
}

defineProps<ProjectCardProps>()

function openTasksLabel(project: ProjectWithCounts): string {
  const n = project.open_tasks
  return `${n} tâche${n > 1 ? 's' : ''} ouverte${n > 1 ? 's' : ''}`
}

/** Largeur du remplissage, 0 → 100 (0 si le projet n'a aucune tâche). */
function fillPercent(project: ProjectWithCounts): number {
  if (project.task_count <= 0) return 0
  return Math.max(
    0,
    Math.min(100, Math.round((project.done_tasks / project.task_count) * 100)),
  )
}
</script>

<template>
  <NuxtLink
    :to="`/projets/${project.id}`"
    class="surface group lift flex items-center gap-5 px-5 py-4"
    :aria-label="`${project.name} — ${project.done_tasks} tâches sur ${project.task_count} terminées`"
  >
    <span
      class="grid h-11 w-11 flex-none place-items-center rounded-sm border border-line bg-surface-800"
      aria-hidden="true"
    >
      <UiIcon name="folder" class="h-[19px] w-[19px] text-ink-500" />
    </span>

    <span class="min-w-0 flex-1">
      <span
        class="block truncate text-[15px] font-semibold text-ink-100 transition-colors group-hover:text-accent-400"
        :title="project.name"
      >
        {{ project.name }}
      </span>
      <span
        class="mt-0.5 block truncate font-mono text-[12px] text-ink-700"
        :title="project.folder_path"
      >
        {{ project.folder_path }}
      </span>
      <span class="mt-2.5 flex items-center gap-3">
        <span
          class="h-[4px] w-32 overflow-hidden rounded-full bg-surface-600"
          aria-hidden="true"
        >
          <span
            class="block h-full rounded-full bg-accent-fill"
            :style="{
              width: `${fillPercent(project)}%`,
              transition: 'width 600ms var(--ease-in-out)',
            }"
          />
        </span>
        <span class="tnum font-mono text-[11px] text-ink-700">
          {{ project.done_tasks }}/{{ project.task_count }}
        </span>
      </span>
    </span>

    <UiBadge tone="accent" class="flex-none">
      {{ openTasksLabel(project) }}
    </UiBadge>
  </NuxtLink>
</template>
