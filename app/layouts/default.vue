<script setup lang="ts">
import LayoutSidebar from '~/components/layout/Sidebar.vue'
import LayoutTopbar from '~/components/layout/Topbar.vue'
</script>

<template>
  <div class="flex min-h-screen bg-surface-950 text-ink-100">
    <!-- Sidebar : fixe à gauche sur grand écran, remplacée par une barre compacte en haut sur petit écran -->
    <LayoutSidebar class="hidden lg:flex" />

    <!-- Zone principale -->
    <div class="flex flex-1 flex-col min-w-0">
      <!-- Barre de navigation compacte (petits écrans) -->
      <nav
        aria-label="Navigation principale"
        class="flex items-center gap-2 border-b border-line bg-surface-900 px-4 py-3 lg:hidden"
      >
        <NuxtLink
          to="/"
          class="rounded-lg px-3 py-1.5 text-sm text-ink-300 transition-colors hover:bg-surface-800 hover:text-ink-100"
          :class="{ 'bg-surface-800 text-ink-100': $route.path === '/' }"
        >
          Tableau de bord
        </NuxtLink>
        <NuxtLink
          to="/aujourdhui"
          class="rounded-lg px-3 py-1.5 text-sm text-ink-300 transition-colors hover:bg-surface-800 hover:text-ink-100"
          :class="{ 'bg-surface-800 text-ink-100': $route.path === '/aujourdhui' }"
        >
          Aujourd'hui
        </NuxtLink>
        <NuxtLink
          to="/reglages"
          class="rounded-lg px-3 py-1.5 text-sm text-ink-300 transition-colors hover:bg-surface-800 hover:text-ink-100"
          :class="{ 'bg-surface-800 text-ink-100': $route.path === '/reglages' }"
        >
          Réglages
        </NuxtLink>
      </nav>

      <LayoutTopbar />

      <main class="p-8">
        <div class="mx-auto w-full max-w-6xl">
          <slot />
        </div>
      </main>
    </div>

    <!-- Hôte des toasts (auto-importé depuis app/components/ui/) : monté une seule fois -->
    <UiToastHost />
  </div>
</template>
