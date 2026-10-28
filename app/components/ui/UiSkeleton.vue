<script setup lang="ts">
interface UiSkeletonProps {
  class?: string
}

withDefaults(defineProps<UiSkeletonProps>(), {
  class: 'h-4 w-full',
})
</script>

<template>
  <div
    class="animate-pulse rounded bg-surface-800"
    :class="class"
    aria-hidden="true"
  />
</template>
