<script setup lang="ts">
import { computed, nextTick, onMounted, onUpdated, onUnmounted, ref } from 'vue'
import type { CSSProperties } from 'vue'

interface NavItem {
  label: string
  to: string
}

interface NavGroup {
  title: string
  items: NavItem[]
}

const route = useRoute()
const { summary, pending: gamificationPending, load } = useGamification()
const { status, pending: bridgePending, refresh } = useBridge()

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
      { label: 'Projets dev', to: '/projets' },
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

// ─── Pied de rail : compteur de série + voyant du pont local ───────────────

/** Affichage du compteur de série : chiffre + « j », ou « — » pendant le chargement. */
const streakLabel = computed<string>(() => {
  if (summary.value === null) {
    return gamificationPending.value ? '—' : '0 j'
  }
  return `${summary.value.streak} j`
})

type BridgeTone = 'ok' | 'down' | 'pending'

const bridge = computed<{
  tone: BridgeTone
  label: string
  reason: string | null
}>(() => {
  const current = status.value
  if (current === null) {
    return {
      tone: 'pending',
      label: 'Connexion',
      reason: bridgePending.value
        ? 'Vérification du pont local…'
        : 'Statut du pont local inconnu.',
    }
  }
  if (current.available) {
    return { tone: 'ok', label: 'Actif', reason: current.reason }
  }
  return { tone: 'down', label: 'Indisponible', reason: current.reason }
})

const bridgeDotClass = computed<string>(() => {
  switch (bridge.value.tone) {
    case 'ok':
      return 'bg-ok-400'
    case 'down':
      return 'bg-danger-400'
    default:
      return 'bg-ink-700'
  }
})

const bridgeDotStyle = computed<CSSProperties>(() => {
  if (bridge.value.tone === 'pending') return {}
  const colorVar =
    bridge.value.tone === 'ok' ? '--color-ok-400' : '--color-danger-400'
  return { boxShadow: `0 0 8px 0 var(${colorVar})` }
})

// ─── Indicateur « vous êtes ici » : un seul élément, déplacé par le JS ─────
// Pas d'apparition/disparition : la barre glisse d'une entrée à l'autre en
// transformant son translateY (240ms, ease-out-expo).
//
// Mesure DÉTERMINISTE : on cible l'entrée par sa destination (`a[data-to]`),
// jamais par `aria-current` (la pose de cet attribut par Vue race avec la
// mesure). Les liens sont toujours rendus, donc l'élément existe toujours et
// son `offsetTop` est stable — on se contente de le relire à chaque changement.

const navEl = ref<HTMLElement | null>(null)
const indicatorTop = ref(0)
const indicatorHeight = ref(0)
const indicatorReady = ref(false)

function updateIndicator(): void {
  const nav = navEl.value
  if (nav === null) return
  const active = nav.querySelector<HTMLElement>(`a[data-to="${route.path}"]`)
  if (active === null) {
    indicatorReady.value = false
    return
  }
  indicatorTop.value = active.offsetTop
  indicatorHeight.value = active.offsetHeight
  indicatorReady.value = true
}

const indicatorStyle = computed<CSSProperties>(() => ({
  transform: `translateY(${indicatorTop.value}px)`,
  height: `${indicatorHeight.value}px`,
  transition: 'transform 240ms var(--ease-out-expo)',
  boxShadow: '0 0 12px 0 var(--color-accent-400)',
}))

function onResize(): void {
  updateIndicator()
}

let resizeObserver: ResizeObserver | null = null

onMounted(() => {
  // Les deux stores ont leur garde anti-double-chargement : aucun appel en double.
  void load()
  void refresh()
  void nextTick(updateIndicator)
  window.addEventListener('resize', onResize, { passive: true })
  // Recalcule aussi quand la hauteur du rail change (scroll, breakpoint…).
  if (import.meta.client && navEl.value !== null && typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(() => updateIndicator())
    resizeObserver.observe(navEl.value)
  }
})

onUnmounted(() => {
  window.removeEventListener('resize', onResize)
  resizeObserver?.disconnect()
  resizeObserver = null
})

// `onUpdated` : après chaque re-rendu du rail (la pose de `aria-current` et le
// changement de `route.path` en font partie), on re-mesure. Le ciblage par
// `data-to` est stable — pas de dépendance à un attribut posé plus tard, donc
// aucun « un pas en retard ». `indicatorTop` ne change pas → pas de boucle.
onUpdated(() => {
  updateIndicator()
})
</script>

<template>
  <aside
    class="sticky top-0 h-screen w-[232px] shrink-0 flex-col border-r border-line bg-surface-900"
  >
    <!-- Wordmark : pas de logo, la typographie EST le signe -->
    <div class="px-5 pt-6 pb-5">
      <NuxtLink to="/" class="inline-flex flex-col gap-1.5">
        <span class="text-[26px] font-extrabold tracking-[-0.05em] text-ink-100">
          OSS<span class="text-accent-400">O</span>
        </span>
        <span class="micro text-ink-700">Console personnelle</span>
      </NuxtLink>
    </div>

    <nav
      ref="navEl"
      aria-label="Navigation principale"
      class="relative flex flex-1 flex-col gap-5 overflow-y-auto px-2 pb-4"
    >
      <!-- Barre « vous êtes ici » : unique, glissante, avec lueur ambre -->
      <span
        v-if="indicatorReady"
        aria-hidden="true"
        class="pointer-events-none absolute top-0 left-0 w-[2px] rounded-full bg-accent-400"
        :style="indicatorStyle"
      />

      <div v-for="group in groups" :key="group.title">
        <p class="micro px-3 pt-3 pb-2 text-ink-700">{{ group.title }}</p>
        <ul class="space-y-1">
          <li v-for="item in group.items" :key="item.to">
            <NuxtLink
              :to="item.to"
              :data-to="item.to"
              class="block rounded-sm px-3 py-2 text-sm transition-colors"
              :class="
                isActive(item.to)
                  ? 'bg-surface-800 text-ink-100'
                  : 'text-ink-500 hover:bg-surface-800 hover:text-ink-100'
              "
              :aria-current="isActive(item.to) ? 'page' : undefined"
            >
              {{ item.label }}
            </NuxtLink>
          </li>
        </ul>
      </div>
    </nav>

    <!-- Pied de rail : c'est lui qui justifie la métaphore de cockpit -->
    <div class="space-y-3 border-t border-line px-4 py-4">
      <div class="flex items-center justify-between gap-2">
        <span class="micro text-ink-700">Série</span>
        <span class="font-mono text-sm font-bold text-ink-100 tnum">
          {{ streakLabel }}
        </span>
      </div>
      <div class="flex items-center justify-between gap-2">
        <span class="micro text-ink-700">Pont local</span>
        <span
          class="inline-flex min-w-0 items-center gap-2"
          :title="bridge.reason ?? undefined"
        >
          <span
            class="h-[7px] w-[7px] shrink-0 rounded-full"
            :class="bridgeDotClass"
            :style="bridgeDotStyle"
            aria-hidden="true"
          />
          <span class="micro truncate text-ink-300">{{ bridge.label }}</span>
        </span>
      </div>
    </div>
  </aside>
</template>
