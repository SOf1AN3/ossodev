<script setup lang="ts">
interface UiEmptyStateProps {
  icon?: string
  title: string
  description?: string
}

withDefaults(defineProps<UiEmptyStateProps>(), {
  icon: undefined,
  description: undefined,
})
</script>

<template>
  <div
    class="flex flex-col items-center justify-center gap-3 rounded-xl border border-line bg-surface-900 px-6 py-16 text-center"
  >
    <span v-if="icon" class="text-4xl" aria-hidden="true">{{ icon }}</span>
    <h2 class="text-lg font-medium text-ink-100">{{ title }}</h2>
    <p v-if="description" class="max-w-md text-sm text-ink-300">{{ description }}</p>
    <div v-if="$slots.action" class="mt-2">
      <slot name="action" />
    </div>
  </div>
</template>
