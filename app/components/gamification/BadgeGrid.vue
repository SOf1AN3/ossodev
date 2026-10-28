<script setup lang="ts">
import type { BadgeWithEarnedAt } from '~/composables/useGamification'
import { formatShortDate } from '~/utils/dates'

// Grille des 12 badges : gagnés en plein, non gagnés atténués (grisés)
// avec leur condition d'obtention en texte.
interface BadgeGridProps {
  badges: BadgeWithEarnedAt[]
}

defineProps<BadgeGridProps>()

function earnedDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return 'date inconnue'
  return formatShortDate(date)
}
</script>

<template>
  <ul class="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
    <li
      v-for="badge in badges"
      :key="badge.code"
      class="flex flex-col gap-2 rounded-xl border border-line p-4"
      :class="
        badge.earned_at !== null
          ? 'bg-surface-800'
          : 'bg-surface-900 opacity-40 grayscale'
      "
    >
      <span class="text-3xl" aria-hidden="true">{{ badge.icon }}</span>

      <div class="min-w-0">
        <p class="text-sm font-medium text-ink-100">{{ badge.name }}</p>

        <p v-if="badge.earned_at !== null" class="mt-1 text-xs text-ink-500">
          Gagné le {{ earnedDate(badge.earned_at) }}
        </p>
        <p v-else class="mt-1 text-xs text-ink-300">
          {{ badge.description }}
        </p>
      </div>

      <span class="sr-only">
        {{ badge.earned_at !== null ? 'Badge débloqué' : 'Badge verrouillé' }}
      </span>
    </li>
  </ul>
</template>
