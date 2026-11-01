<script setup lang="ts">
import { NAV_GROUPS } from '~/utils/navigation'

type PaletteGroup = 'Sections' | 'Projets' | 'Tâches' | 'Cours'

const GROUP_ORDER: readonly PaletteGroup[] = ['Sections', 'Projets', 'Tâches', 'Cours']

interface PaletteItem {
  id: string
  group: PaletteGroup
  label: string
  detail: string
  to: string
}

interface GroupedEntry {
  item: PaletteItem
  /** Position plate dans la liste aplatie (nav clavier + aria-activedescendant). */
  index: number
}

interface ResultGroup {
  label: PaletteGroup
  items: GroupedEntry[]
}

const { isOpen, close, toggle, projects, tasks, courses, loading, loadError, load } =
  useCommandPalette()

const query = ref('')
const activeIndex = ref(0)
const inputRef = ref<HTMLInputElement | null>(null)
let previouslyFocused: HTMLElement | null = null

// ─── Sources ─────────────────────────────────────────────────────────────────

const sectionItems = computed<PaletteItem[]>(() =>
  NAV_GROUPS.flatMap((group) =>
    group.items.map((item) => ({
      id: `section:${item.to}`,
      group: 'Sections' as const,
      label: item.label,
      detail: group.title,
      to: item.to,
    })),
  ),
)

const projectItems = computed<PaletteItem[]>(() =>
  projects.value.map((project) => ({
    id: `project:${project.id}`,
    group: 'Projets' as const,
    label: project.name,
    detail: project.folder_path,
    to: `/projets/${project.id}`,
  })),
)

const taskItems = computed<PaletteItem[]>(() =>
  tasks.value.map((task) => ({
    id: `task:${task.id}`,
    group: 'Tâches' as const,
    label: task.title,
    detail: task.scheduled_date,
    to: '/aujourdhui',
  })),
)

const courseItems = computed<PaletteItem[]>(() =>
  courses.value.map((course) => ({
    id: `course:${course.technology}`,
    group: 'Cours' as const,
    label: course.title,
    detail: course.technology,
    to: `/apprentissage/${course.technology}`,
  })),
)

const allItems = computed<PaletteItem[]>(() => [
  ...sectionItems.value,
  ...projectItems.value,
  ...taskItems.value,
  ...courseItems.value,
])

// ─── Filtrage client (insensible à la casse, préfixe d'abord) ────────────────

/** 0 si le libellé commence par la requête, 1 s'il la contient, sinon exclu. */
function rankMatch(label: string, q: string): number | null {
  const lower = label.toLowerCase()
  if (lower.startsWith(q)) return 0
  if (lower.includes(q)) return 1
  return null
}

const groupedResults = computed<ResultGroup[]>(() => {
  const q = query.value.trim().toLowerCase()
  let flatIndex = 0
  const out: ResultGroup[] = []
  for (const label of GROUP_ORDER) {
    const entries = allItems.value
      .filter((item) => item.group === label)
      .map((item) => ({ item, rank: q === '' ? 0 : rankMatch(item.label, q) }))
      .filter((entry): entry is { item: PaletteItem; rank: number } => entry.rank !== null)
      .sort((a, b) => a.rank - b.rank)
      .map(({ item }) => ({ item, index: flatIndex++ }))
    if (entries.length > 0) out.push({ label, items: entries })
  }
  return out
})

const flatResults = computed<PaletteItem[]>(() =>
  groupedResults.value.flatMap((group) => group.items.map((entry) => entry.item)),
)

const activeId = computed<string | null>(() =>
  flatResults.value.length === 0 ? null : `palette-option-${activeIndex.value}`,
)

watch(query, () => {
  activeIndex.value = 0
})

// ─── Navigation clavier ──────────────────────────────────────────────────────

function moveActive(delta: number): void {
  const total = flatResults.value.length
  if (total === 0) return
  activeIndex.value = (activeIndex.value + delta + total) % total
}

function goActive(): void {
  const item = flatResults.value[activeIndex.value]
  if (item !== undefined) void go(item)
}

async function go(item: PaletteItem): Promise<void> {
  close()
  await navigateTo(item.to)
}

function retry(): void {
  void load()
}

function onInputKeydown(event: KeyboardEvent): void {
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    moveActive(1)
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    moveActive(-1)
  } else if (event.key === 'Enter') {
    event.preventDefault()
    goActive()
  }
}

// ─── Raccourci global ⌘K / Ctrl+K ────────────────────────────────────────────

function isDesktopViewport(): boolean {
  return window.matchMedia('(min-width: 1024px)').matches
}

function onWindowKeydown(event: KeyboardEvent): void {
  const isToggleCombo =
    (event.metaKey || event.ctrlKey) &&
    !event.altKey &&
    !event.shiftKey &&
    event.key.toLowerCase() === 'k'
  if (isToggleCombo) {
    // Raccourci inactif sous lg : le tiroir hamburger reste le seul accès mobile.
    if (!isOpen.value && !isDesktopViewport()) return
    event.preventDefault()
    toggle()
    return
  }
  if (event.key === 'Escape' && isOpen.value) {
    event.preventDefault()
    close()
  }
}

onMounted(() => {
  window.addEventListener('keydown', onWindowKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onWindowKeydown)
})

// ─── Focus : capture à l'ouverture, restitution à la fermeture ───────────────

watch(isOpen, async (openState: boolean) => {
  if (openState) {
    previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    query.value = ''
    activeIndex.value = 0
    await nextTick()
    inputRef.value?.focus()
  } else {
    previouslyFocused?.focus()
    previouslyFocused = null
  }
})

// L'option active reste visible dans la zone de défilement sans voler le focus.
watch(activeIndex, async () => {
  await nextTick()
  const id = activeId.value
  if (id === null) return
  document.getElementById(id)?.scrollIntoView({ block: 'nearest' })
})
</script>

<template>
  <Teleport to="body">
    <!-- Masquée sous lg : le drawer hamburger reste le chemin mobile exclusif -->
    <div
      v-if="isOpen"
      class="fixed inset-0 z-[70] hidden lg:block"
      role="dialog"
      aria-modal="true"
      aria-label="Palette de commandes"
    >
      <!-- Voile -->
      <div
        class="absolute inset-0 bg-surface-950/70 backdrop-blur-sm"
        aria-hidden="true"
        @click="close"
      />

      <!-- Panneau centré horizontalement, ancré en haut -->
      <div class="relative flex justify-center px-4 pt-[12vh]">
        <div
          class="surface-overlay w-full max-w-xl overflow-hidden rounded-lg border border-line [box-shadow:var(--shadow-rest)]"
        >
          <!-- Recherche -->
          <div class="field flex items-center gap-3 border-b border-line px-4">
            <UiIcon name="search" class="shrink-0 text-ink-500" />
            <input
              ref="inputRef"
              v-model="query"
              type="text"
              role="combobox"
              aria-expanded="true"
              aria-controls="palette-listbox"
              :aria-activedescendant="activeId ?? undefined"
              aria-label="Rechercher une section, un projet, une tâche ou un cours"
              placeholder="Rechercher…"
              class="w-full bg-transparent py-3.5 text-sm text-ink-100 placeholder:text-ink-700 focus:outline-none"
              @keydown="onInputKeydown"
            />
            <kbd
              class="hidden shrink-0 rounded-xs border border-line px-1.5 py-0.5 font-mono text-[10px] text-ink-700 sm:block"
            >
              Échap
            </kbd>
          </div>

          <!-- États chargement / erreur -->
          <p v-if="loading" class="px-4 py-3 text-sm text-ink-500" role="status">
            Chargement des résultats…
          </p>
          <p v-else-if="loadError !== null" class="px-4 py-3 text-sm text-ink-500" role="alert">
            {{ loadError }}
            <button
              type="button"
              class="mt-1 block text-xs text-accent-400 transition-colors hover:text-ink-100"
              @click="retry"
            >
              Réessayer
            </button>
          </p>

          <!-- Résultats groupés (listbox toujours rendue : `aria-controls` doit exister) -->
          <div
            id="palette-listbox"
            role="listbox"
            aria-label="Résultats"
            class="max-h-[55vh] overflow-y-auto p-2"
          >
            <template v-if="flatResults.length > 0">
              <div
                v-for="group in groupedResults"
                :key="group.label"
                role="group"
                :aria-label="group.label"
              >
                <p class="micro px-3 pt-3 pb-1.5 text-ink-700" aria-hidden="true">
                  {{ group.label }}
                </p>
                <div
                  v-for="entry in group.items"
                  :id="`palette-option-${entry.index}`"
                  :key="entry.item.id"
                  role="option"
                  :aria-selected="entry.index === activeIndex"
                  class="flex cursor-pointer items-center gap-3 rounded-sm px-3 py-2 text-sm transition-colors"
                  :class="
                    entry.index === activeIndex
                      ? 'bg-surface-800 text-ink-100'
                      : 'text-ink-300 hover:bg-surface-800'
                  "
                  @mousemove="activeIndex = entry.index"
                  @click="go(entry.item)"
                >
                  <span class="min-w-0 flex-1 truncate">{{ entry.item.label }}</span>
                  <span
                    v-if="entry.item.detail !== ''"
                    class="max-w-[45%] shrink-0 truncate font-mono text-[11px] text-ink-700"
                    :title="entry.item.detail"
                  >
                    {{ entry.item.detail }}
                  </span>
                </div>
              </div>
            </template>

            <!-- Vide -->
            <p
              v-if="flatResults.length === 0 && loading === false && loadError === null"
              class="px-3 py-6 text-center text-sm text-ink-500"
            >
              Aucun résultat pour « {{ query }} ».
            </p>
          </div>

          <!-- Aides clavier -->
          <div class="flex items-center gap-4 border-t border-line px-4 py-2">
            <span class="micro flex items-center gap-1.5 text-ink-700">
              <kbd class="rounded-xs border border-line px-1 font-mono text-[10px]">↑</kbd>
              <kbd class="rounded-xs border border-line px-1 font-mono text-[10px]">↓</kbd>
              naviguer
            </span>
            <span class="micro flex items-center gap-1.5 text-ink-700">
              <kbd class="rounded-xs border border-line px-1 font-mono text-[10px]">Entrée</kbd>
              ouvrir
            </span>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
