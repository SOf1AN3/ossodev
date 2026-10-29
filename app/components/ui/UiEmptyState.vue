<script setup lang="ts">
import { computed } from 'vue'

interface UiEmptyStateProps {
  /** Emoji de contenu (legacy). À défaut, une icône d'interface par défaut est rendue. */
  icon?: string
  title: string
  description?: string
  /**
   * Niveau de titre rendu pour `title`.
   * Passer `'h1'` quand cet état constitue le titre principal de la page
   * (un seul `h1` par page, jamais de doublon `sr-only` à côté).
   */
  titleLevel?: 'h1' | 'h2'
}

const props = withDefaults(defineProps<UiEmptyStateProps>(), {
  icon: undefined,
  description: undefined,
  titleLevel: 'h2',
})

const titleTag = computed(() => props.titleLevel)
</script>

<template>
  <div
    class="surface flex flex-col items-center justify-center gap-3 px-6 py-16 text-center"
  >
    <span
      v-if="icon"
      class="text-4xl"
      aria-hidden="true"
    >{{ icon }}</span>
    <span
      v-else
      class="mb-1 flex h-12 w-12 items-center justify-center rounded-full bg-surface-800 text-ink-500"
      aria-hidden="true"
    >
      <UiIcon name="target" class="h-6 w-6" />
    </span>
    <component
      :is="titleTag"
      class="text-lg font-medium text-ink-100"
    >
      {{ title }}
    </component>
    <p v-if="description" class="max-w-md text-sm text-ink-300">{{ description }}</p>
    <div v-if="$slots.action" class="mt-2">
      <slot name="action" />
    </div>
  </div>
</template>
