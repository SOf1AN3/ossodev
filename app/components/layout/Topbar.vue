<script setup lang="ts">
import UiBadge from '~/components/ui/UiBadge.vue'
</script>

<template>
  <header
    class="flex items-center justify-between gap-4 border-b border-line bg-surface-950/60 px-8 py-4"
  >
    <!-- Titre de page injecté par les pages -->
    <div class="min-w-0">
      <slot />
    </div>

    <!-- Statut local : affichage fixe, sans API pour l'instant -->
    <UiBadge tone="ok">
      <span class="inline-flex items-center gap-2">
        <span
          class="inline-block h-2 w-2 rounded-full bg-ok-400"
          aria-hidden="true"
        />
        Statut local
      </span>
    </UiBadge>
  </header>
</template>
