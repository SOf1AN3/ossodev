<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import LayoutSidebar from '~/components/layout/Sidebar.vue'
import LayoutTopbar from '~/components/layout/Topbar.vue'
import { NAV_GROUPS } from '~/utils/navigation'

const route = useRoute()
const { isOpen, close } = useMobileNav()

// Fermeture à la navigation : sélection d'un lien (ou History).
watch(
  () => route.path,
  () => close(),
)

// ─── Tiroir mobile : dialog modal avec piège de focus ──────────────────────
// Sans piège, un utilisateur au clavier sort du panneau et tabule dans la page
// masquée derrière — invisible et inatteignable visuellement.

const panelEl = ref<HTMLElement | null>(null)

// Le déclencheur est le bouton hamburger du Topbar (même `aria-controls`).
const TRIGGER_SELECTOR = '[aria-controls="mobile-nav-panel"]'

function focusTrigger(): void {
  const trigger = document.querySelector<HTMLElement>(TRIGGER_SELECTOR)
  trigger?.focus()
}

function firstFocusable(): HTMLElement | null {
  return panelEl.value?.querySelector<HTMLElement>('a[href]') ?? null
}

/** Tab/Shift+Tab bouclent dans le panneau ; Échap referme (le focus suit via le watcher). */
function onPanelKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.preventDefault()
    close()
    return
  }
  if (event.key !== 'Tab') return
  const panel = panelEl.value
  if (panel === null) return
  const focusables = panel.querySelectorAll<HTMLElement>('a[href], button:not([disabled])')
  const first = focusables.item(0)
  const last = focusables.item(focusables.length - 1)
  if (first === null || last === null) return
  const active = document.activeElement
  // Focus hors panneau (ou nulle) : on le ramène à l'intérieur, jamais au-delà.
  const outside = active === null || !panel.contains(active)
  if (event.shiftKey) {
    if (active === first || outside) {
      event.preventDefault()
      last.focus()
    }
  } else if (active === last || outside) {
    event.preventDefault()
    first.focus()
  }
}

// Le piège n'existe que pendant l'ouverture : on branche le listener à
// l'entrée, on le retire à la sortie et on rend le focus au bouton hamburger
// (chemin unique de fermeture : voile, lien, Échap ou route).
//
// Le scroll de la page est aussi verrouillé pendant l'ouverture : sans quoi
// la page glisserait derrière le voile au doigt, ce qui est désorientant sur
// mobile (et rend la fermeture par voile hasardeuse).
watch(isOpen, async (open: boolean) => {
  if (open) {
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', onPanelKeydown, true)
    await nextTick()
    firstFocusable()?.focus()
  } else {
    // `''` supprime la règle inline et rend la main au CSS — aucune autre
    // partie de l'app ne pose d'`overflow` sur `body` (vérifié).
    document.body.style.overflow = ''
    document.removeEventListener('keydown', onPanelKeydown, true)
    focusTrigger()
  }
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onPanelKeydown, true)
  // Le composant pourrait être démonté avec le tiroir encore ouvert
  // (navigation vers une page hors layout) : on ne laisse jamais le scroll bloqué.
  document.body.style.overflow = ''
})
</script>

<template>
  <!-- Pas de fond en dur ici : <html>/<body> portent déjà le fond via main.css
       (sinon la permutation de thème casse). Seuls les tokens font foi. -->
  <div class="flex min-h-screen text-ink-100">
    <!-- Rail d'instruments : fixe à gauche sur grand écran (232px) — inchangé -->
    <LayoutSidebar class="hidden lg:flex" />

    <!-- Tiroir de navigation (sous lg uniquement) : voile + panneau modal -->
    <template v-if="isOpen">
      <div
        class="fixed inset-0 z-50 bg-surface-950/70 lg:hidden"
        aria-hidden="true"
        @click="close"
      />

      <div
        id="mobile-nav-panel"
        ref="panelEl"
        role="dialog"
        aria-modal="true"
        aria-label="Navigation"
        class="fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col border-r border-line bg-surface-900 lg:hidden"
      >
        <!-- En-tête du tiroir : wordmark + fermeture explicite -->
        <div class="flex items-center justify-between border-b border-line px-5 py-4">
          <span class="text-[26px] font-extrabold tracking-[-0.05em] text-ink-100">
            OSS<span class="text-accent-400">O</span>
          </span>
          <button
            type="button"
            class="flex h-8 w-8 items-center justify-center rounded-sm border border-line text-ink-300 transition-colors hover:bg-surface-800 hover:text-ink-100"
            aria-label="Fermer la navigation"
            @click="close"
          >
            <UiIcon name="close" />
          </button>
        </div>

        <!-- Même repère ARIA que le rail desktop, mais les deux ne sont jamais
             visibles en même temps (hidden lg:flex / lg:hidden) : un seul
             landmark « Navigation principale » dans l'arbre d'accessibilité. -->
        <nav aria-label="Navigation principale" class="flex-1 overflow-y-auto px-2 pb-4">
          <div v-for="group in NAV_GROUPS" :key="group.title">
            <p class="micro px-3 pt-5 pb-1.5 select-none text-ink-700">{{ group.title }}</p>
            <ul class="space-y-1">
              <li v-for="item in group.items" :key="item.to">
                <NuxtLink
                  :to="item.to"
                  class="block rounded-sm px-3 py-2 text-sm transition-colors"
                  :class="
                    route.path === item.to
                      ? 'bg-surface-800 text-ink-100'
                      : 'text-ink-500 hover:bg-surface-800 hover:text-ink-100'
                  "
                  :aria-current="route.path === item.to ? 'page' : undefined"
                  @click="close"
                >
                  {{ item.label }}
                </NuxtLink>
              </li>
            </ul>
          </div>
        </nav>
      </div>
    </template>

    <!-- Zone principale -->
    <div class="flex min-w-0 flex-1 flex-col">
      <LayoutTopbar />

      <main class="min-w-0 flex-1 p-4 sm:p-6 lg:p-8">
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
