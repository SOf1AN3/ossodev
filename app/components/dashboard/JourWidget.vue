<script setup lang="ts">
import type { GamificationSummary } from '~~/shared/types'
import { formatLongDate } from '~/utils/dates'

// Blocs ① (métrique géante) + ② (arc d'instrument) de la bande héro cockpit.
// Le composant ne rend que du markup « instrument » : pas de carte, pas de
// bouton — la mise en page appartient à la page tableau de bord.
interface JourWidgetProps {
  summary: GamificationSummary
}

const props = defineProps<JourWidgetProps>()

const longDate = formatLongDate(new Date())

/** Avancement de la journée, 0 → 100 (0 si rien n'est planifié). */
const percent = computed<number>(() => {
  const { scheduledToday, doneToday } = props.summary
  if (scheduledToday <= 0) return 0
  return Math.max(0, Math.min(100, Math.round((doneToday / scheduledToday) * 100)))
})

/** `pathLength="100"` : l'arc se vide de la droite vers la gauche. */
const dashOffset = computed<number>(() => 100 - percent.value)
</script>

<template>
  <!-- ① Métrique géante -->
  <div class="min-w-[190px]">
    <h1 class="micro text-ink-700">{{ longDate }}</h1>
    <p class="tnum display display-xl mt-2 text-ink-100">
      <span>{{ summary.doneToday }}</span
      ><span class="text-ink-700">/{{ summary.scheduledToday }}</span>
    </p>
    <p class="mt-2 text-[13px] text-ink-500">tâches validées</p>
  </div>

  <span
    class="hidden self-stretch bg-line lg:block"
    style="width: 1px"
    aria-hidden="true"
  />

  <!-- ② Arc d'instrument -->
  <div class="relative h-[104px] w-[104px]">
    <svg
      viewBox="0 0 120 120"
      class="h-[104px] w-[104px] -rotate-90"
      role="img"
      :aria-label="`${percent} % de la journée validée`"
    >
      <circle
        cx="60"
        cy="60"
        r="52"
        fill="none"
        stroke="var(--color-surface-600)"
        stroke-width="7"
      />
      <circle
        cx="60"
        cy="60"
        r="52"
        fill="none"
        stroke="var(--color-accent-fill)"
        stroke-width="7"
        stroke-linecap="round"
        pathLength="100"
        stroke-dasharray="100"
        :stroke-dashoffset="dashOffset"
        style="transition: stroke-dashoffset 600ms var(--ease-in-out)"
      />
    </svg>
    <span
      class="tnum absolute inset-0 flex items-center justify-center font-mono font-bold text-ink-100"
    >
      {{ percent }}<span class="text-ink-500">%</span>
    </span>
  </div>
</template>
