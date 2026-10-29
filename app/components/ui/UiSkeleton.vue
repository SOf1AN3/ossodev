<script setup lang="ts">
interface UiSkeletonProps {
  class?: string
}

withDefaults(defineProps<UiSkeletonProps>(), {
  class: 'h-4 w-full',
})
</script>

<template>
  <!-- Balayage lumineux (.skel), jamais une pulsation d'opacité -->
  <div
    class="skel rounded-xs"
    :class="class"
    aria-hidden="true"
  />
</template>
