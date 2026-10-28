<script setup lang="ts">
interface NavItem {
  label: string
  to: string
}

interface NavGroup {
  title: string
  items: NavItem[]
}

const route = useRoute()

const groups: NavGroup[] = [
  {
    title: "AUJOURD'HUI",
    items: [
      { label: 'Tableau de bord', to: '/' },
      { label: "Aujourd'hui", to: '/aujourdhui' },
      { label: 'Planifier', to: '/planifier' },
      { label: 'Routines', to: '/routines' },
    ],
  },
  {
    title: 'PROJETS',
    items: [
      { label: 'Idées', to: '/idees' },
      { label: 'Projets', to: '/projets' },
    ],
  },
  {
    title: 'SYSTÈME',
    items: [
      { label: 'Progrès', to: '/progres' },
      { label: 'Réglages', to: '/reglages' },
    ],
  },
]

/** Match exact sur `to`, sauf pour la racine où seul `/` compte. */
function isActive(to: string): boolean {
  if (to === '/') return route.path === '/'
  return route.path === to
}
</script>

<template>
  <aside
    class="sticky top-0 h-screen w-64 shrink-0 flex-col border-r border-line bg-surface-900"
  >
    <div class="px-5 py-6">
      <NuxtLink
        to="/"
        class="text-lg text-accent-400 font-semibold tracking-wide"
      >
        OSSO
      </NuxtLink>
    </div>

    <nav aria-label="Navigation principale" class="flex flex-1 flex-col gap-6 overflow-y-auto px-3 pb-4">
      <div v-for="group in groups" :key="group.title">
        <p
          class="px-3 pb-2 text-xs font-medium uppercase tracking-wider text-ink-500"
        >
          {{ group.title }}
        </p>
        <ul class="space-y-1">
          <li v-for="item in group.items" :key="item.to">
            <NuxtLink
              :to="item.to"
              class="block rounded-r-lg py-2 pl-4 pr-3 text-sm border-l-2 border-transparent transition-colors"
              :class="
                isActive(item.to)
                  ? 'border-accent-400 bg-surface-800 text-ink-100'
                  : 'text-ink-300 hover:bg-surface-800 hover:text-ink-100'
              "
              :aria-current="isActive(item.to) ? 'page' : undefined"
            >
              {{ item.label }}
            </NuxtLink>
          </li>
        </ul>
      </div>
    </nav>

    <div class="border-t border-line p-4">
      <slot name="footer" />
    </div>
  </aside>
</template>
