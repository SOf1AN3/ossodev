<script setup lang="ts">
import type { BadgeWithEarnedAt } from '~/composables/useGamification'
import { useMoments } from '~/composables/useMoments'

// Grille des 12 badges : gagnés d'abord (du plus récent au plus ancien),
// puis verrouillés par code — plaque emoji, nom et condition d'obtention.
interface BadgeGridProps {
  badges: BadgeWithEarnedAt[]
  /** Code du badge à embraser (moment ②). `null` = rien à embraser. */
  ignitionCode?: string | null
}

const props = withDefaults(defineProps<BadgeGridProps>(), {
  ignitionCode: null,
})

const { igniteBadge } = useMoments()

const rootEl = ref<HTMLElement | null>(null)

/** Timestamp ISO → ms, `0` si absent ou illisible (tri sûr, jamais NaN). */
function earnedTime(iso: string | null): number {
  if (iso === null) return 0
  const time = Date.parse(iso)
  return Number.isNaN(time) ? 0 : time
}

const sortedBadges = computed<BadgeWithEarnedAt[]>(() => {
  const earned = props.badges
    .filter((badge) => badge.earned_at !== null)
    .sort((a, b) => earnedTime(b.earned_at) - earnedTime(a.earned_at))
  const locked = props.badges
    .filter((badge) => badge.earned_at === null)
    .sort((a, b) => a.code.localeCompare(b.code))
  return [...earned, ...locked]
})

/* Moment ② : la classe `igniting` est ajoutée puis retirée par
   `useMoments().igniteBadge()` (halo ambre + 3 braises, 1 000 ms). */
function ignite(code: string | null): void {
  if (code === null) return
  const root = rootEl.value
  if (root === null) return
  const card = root.querySelector<HTMLElement>(
    `[data-badge-code="${code}"]`,
  )
  igniteBadge(card)
}

watch(
  () => props.ignitionCode,
  (code) => {
    if (code === null) return
    void nextTick(() => {
      ignite(code)
    })
  },
  { immediate: true },
)
</script>

<template>
  <ul
    ref="rootEl"
    class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
  >
    <li
      v-for="badge in sortedBadges"
      :key="badge.code"
      :data-badge-code="badge.code"
      class="relative grid place-items-center overflow-visible px-4 py-6 text-center"
      :class="
        badge.earned_at !== null ? 'badge surface lift' : 'opacity-45 grayscale'
      "
    >
      <!-- Braises du moment ② : animées uniquement sous `.igniting`. -->
      <template v-if="badge.earned_at !== null">
        <span class="ember-particle" aria-hidden="true"></span>
        <span class="ember-particle" aria-hidden="true"></span>
        <span class="ember-particle" aria-hidden="true"></span>
        <span class="ember-particle" aria-hidden="true"></span>
      </template>

      <span
        class="grid h-14 w-14 place-items-center rounded-md border border-line bg-surface-800 text-[27px]"
        aria-hidden="true"
      >{{ badge.icon }}</span>

      <p class="mt-3.5 text-[14px] font-semibold text-ink-100">
        {{ badge.name }}
      </p>
      <p class="mt-1 text-[12px] leading-snug text-ink-700">
        {{ badge.description }}
      </p>

      <span class="sr-only">
        {{ badge.earned_at !== null ? 'Badge débloqué' : 'Badge verrouillé' }}
      </span>
    </li>
  </ul>
</template>
