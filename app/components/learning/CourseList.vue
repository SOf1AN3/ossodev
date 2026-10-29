<script setup lang="ts">
import type { LearningCourseSummary } from '~~/shared/types'
import UiBadge from '~/components/ui/UiBadge.vue'

interface CourseListProps {
  courses: LearningCourseSummary[]
}

defineProps<CourseListProps>()

/** « il y a 2 h » / « hier » — Intl.RelativeTimeFormat en français. */
function formatRelative(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return 'date inconnue'
  const rtf = new Intl.RelativeTimeFormat('fr-FR', { numeric: 'auto' })
  const diffMinutes = Math.round((date.getTime() - Date.now()) / 60000)
  if (Math.abs(diffMinutes) < 60) {
    return rtf.format(diffMinutes, 'minute')
  }
  const diffHours = Math.round(diffMinutes / 60)
  if (Math.abs(diffHours) < 24) {
    return rtf.format(diffHours, 'hour')
  }
  return rtf.format(Math.round(diffHours / 24), 'day')
}
</script>

<template>
  <!-- Le tri (todo d'abord, puis updated_at desc) vient déjà du serveur. -->
  <ul class="grid grid-cols-1 gap-4 md:grid-cols-2">
    <li v-for="course in courses" :key="course.technology">
      <NuxtLink
        :to="`/apprentissage/${course.technology}`"
        class="surface lift group flex h-full flex-col gap-3 px-5 py-4 focus-visible:outline-2 focus-visible:outline-accent-400"
      >
        <div class="flex items-start justify-between gap-3">
          <h2
            class="min-w-0 font-semibold text-ink-100 transition-colors group-hover:text-accent-400"
            :title="course.title"
          >
            {{ course.title }}
          </h2>
          <UiBadge
            class="shrink-0"
            :tone="course.status === 'done' ? 'ok' : 'neutral'"
          >
            {{ course.status === 'done' ? 'Accompli' : 'À lire' }}
          </UiBadge>
        </div>

        <p
          class="truncate font-mono text-[12px] text-ink-700"
          :title="course.technology"
        >
          {{ course.technology }}
        </p>

        <p class="micro mt-auto text-ink-700">
          Mis à jour · {{ formatRelative(course.updated_at) }}
        </p>
      </NuxtLink>
    </li>
  </ul>
</template>
