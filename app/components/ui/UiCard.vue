<script setup lang="ts">
// Wrapper de carte générique : contenu par défaut + slots header/footer
</script>

<template>
  <section class="rounded-xl border border-line bg-surface-900 p-5">
    <header v-if="$slots.header" class="mb-4">
      <slot name="header" />
    </header>

    <div>
      <slot />
    </div>

    <footer v-if="$slots.footer" class="mt-4">
      <slot name="footer" />
    </footer>
  </section>
</template>
