<script setup lang="ts">
import { computed } from 'vue'

interface UiEmptyStateProps {
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
    class="flex flex-col items-center justify-center gap-3 rounded-xl border border-line bg-surface-900 px-6 py-16 text-center"
  >
    <span v-if="icon" class="text-4xl" aria-hidden="true">{{ icon }}</span>
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
