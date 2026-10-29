<script setup lang="ts">
import type { CourseHeading } from '~/composables/useMarkdown'

interface CourseTocProps {
  headings: CourseHeading[]
}

const props = defineProps<CourseTocProps>()

const activeId = ref<string | null>(null)

let observer: IntersectionObserver | null = null

/** Sections actuellement dans le bandeau d'observation (persistant). */
const visibleIds = new Set<string>()

/** Recalcule la section active à chaque changement de structure. */
function observe(): void {
  stopObserve()
  visibleIds.clear()
  if (!import.meta.client || props.headings.length === 0) return
  if (typeof IntersectionObserver === 'undefined') return

  observer = new IntersectionObserver(
    (entries) => {
      // L'IntersectionObserver ne renvoie que les changements : on maintient
      // un jeu persistant pour savoir ce qui est visible à cet instant.
      for (const entry of entries) {
        if (entry.isIntersecting) {
          visibleIds.add(entry.target.id)
        } else {
          visibleIds.delete(entry.target.id)
        }
      }
      // Active la première section visible dans l'ordre du document ;
      // si aucune n'est dans le bandeau (haut/bas de page), on conserve
      // la dernière section active.
      const first = props.headings.find((heading) =>
        visibleIds.has(heading.id),
      )
      if (first !== undefined) activeId.value = first.id
    },
    {
      // Décalage sous la topbar sticky : une section devient active
      // lorsqu'elle entre dans le premier tiers de l'écran.
      rootMargin: '-80px 0px -60% 0px',
      threshold: 0,
    },
  )

  for (const heading of props.headings) {
    const element = document.getElementById(heading.id)
    if (element !== null) observer.observe(element)
  }
}

function stopObserve(): void {
  if (observer !== null) {
    observer.disconnect()
    observer = null
  }
  visibleIds.clear()
}

function onLinkClick(id: string): void {
  // Pas de preventDefault : le navigateur suit le href="#…" et le scroll
  // natif est fluide (scroll-behavior: smooth sur html, scroll-margin-top
  // sur les h2 pour ne pas passer sous la topbar sticky).
  activeId.value = id
}

watch(
  () => props.headings,
  () => {
    activeId.value = props.headings[0]?.id ?? null
    nextTick(observe)
  },
  { immediate: true },
)

onMounted(() => {
  nextTick(observe)
})

onBeforeUnmount(stopObserve)
</script>

<template>
  <nav
    aria-label="Sommaire du cours"
    class="sticky top-20 hidden w-56 shrink-0 self-start lg:block"
  >
    <p class="micro mb-3 text-ink-700">Sommaire</p>
    <ul class="flex flex-col gap-0.5 border-l border-line">
      <li v-for="heading in headings" :key="heading.id">
        <a
          :href="`#${heading.id}`"
          class="-ml-px block border-l-2 py-1.5 pl-3 text-sm leading-snug transition-colors"
          :class="
            activeId === heading.id
              ? 'border-accent-400 text-accent-400'
              : 'border-transparent text-ink-500 hover:text-ink-100'
          "
          :aria-current="activeId === heading.id ? 'location' : undefined"
          @click="onLinkClick(heading.id)"
        >
          {{ heading.text }}
        </a>
      </li>
    </ul>
  </nav>
</template>
