<script setup lang="ts">
import LayoutSidebar from '~/components/layout/Sidebar.vue'
import LayoutTopbar from '~/components/layout/Topbar.vue'

/** Liens de la barre compacte (petits écrans) — pas de duplication du rail. */
const compactLinks = [
  { label: 'Tableau de bord', to: '/' },
  { label: "Aujourd'hui", to: '/aujourdhui' },
  { label: 'Réglages', to: '/reglages' },
] as const

const route = useRoute()
</script>

<template>
  <!-- Pas de fond en dur ici : <html>/<body> portent déjà le fond via main.css
       (sinon la permutation de thème casse). Seuls les tokens font foi. -->
  <div class="flex min-h-screen text-ink-100">
    <!-- Rail d'instruments : fixe à gauche sur grand écran (232px) -->
    <LayoutSidebar class="hidden lg:flex" />

    <!-- Zone principale -->
    <div class="flex min-w-0 flex-1 flex-col">
      <LayoutTopbar />

      <!-- Barre de navigation compacte (petits écrans) — libellé distinct du rail
           pour ne pas dupliquer le repère ARIA "Navigation principale". -->
      <nav
        aria-label="Navigation rapide"
        class="flex items-center gap-1 overflow-x-auto border-b border-line bg-surface-900 px-4 py-2 lg:hidden"
      >
        <NuxtLink
          v-for="link in compactLinks"
          :key="link.to"
          :to="link.to"
          class="shrink-0 rounded-sm px-3 py-1.5 text-sm transition-colors"
          :class="
            route.path === link.to
              ? 'bg-surface-800 text-ink-100'
              : 'text-ink-500 hover:bg-surface-800 hover:text-ink-100'
          "
          :aria-current="route.path === link.to ? 'page' : undefined"
        >
          {{ link.label }}
        </NuxtLink>
      </nav>

      <main class="min-w-0 flex-1 p-8">
        <!-- Entrée décalée des blocs de la page (utilitaire .page-enter) -->
        <div class="page-enter mx-auto w-full max-w-6xl">
          <slot />
        </div>
      </main>
    </div>

    <!-- Hôte des toasts (auto-importé depuis app/components/ui/) : monté une seule fois -->
    <UiToastHost />
  </div>
</template>
