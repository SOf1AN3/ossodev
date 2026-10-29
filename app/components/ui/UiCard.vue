<script setup lang="ts">
// Wrapper de carte générique : contenu par défaut + slots header/footer
interface UiCardProps {
  /** Carte survolable : ajoute l'effet de soulèvement (.lift) au hover. */
  interactive?: boolean
}

withDefaults(defineProps<UiCardProps>(), {
  interactive: false,
})
</script>

<template>
  <section
    class="surface p-5"
    :class="interactive ? 'lift' : ''"
  >
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
