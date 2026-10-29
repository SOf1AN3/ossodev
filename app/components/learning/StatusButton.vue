<script setup lang="ts">
import type { LearningStatus } from '~~/shared/types'
import { formatCompletedSince } from '~/composables/useLearning'
import UiButton from '~/components/ui/UiButton.vue'

interface StatusButtonProps {
  status: LearningStatus
  /** ISO 8601 — date de complétion, affichée en mode « Accompli ». */
  completedAt: string | null
  /** Un changement de statut est en cours (désactive les clics). */
  busy?: boolean
}

const props = withDefaults(defineProps<StatusButtonProps>(), {
  busy: false,
})

const emit = defineEmits<{
  /** L'utilisateur valide la lecture du cours. */
  finish: []
  /** L'utilisateur remet le cours en liste de lecture. */
  reset: []
}>()

const sinceLabel = computed<string>(() =>
  formatCompletedSince(props.completedAt),
)
</script>

<template>
  <div
    class="surface sticky bottom-4 z-10 flex flex-wrap items-center justify-between gap-3 px-4 py-3"
  >
    <p v-if="status === 'done'" class="micro text-ok-400">
      {{ sinceLabel }}
    </p>
    <p v-else class="micro text-ink-500">Cours à lire</p>

    <UiButton
      v-if="status === 'todo'"
      :loading="busy"
      @click="emit('finish')"
    >
      J'ai fini
    </UiButton>
    <UiButton
      v-else
      variant="outline"
      :loading="busy"
      @click="emit('reset')"
    >
      Remettre à lire
    </UiButton>
  </div>
</template>
