<script setup lang="ts">
import ProgressBar from '~/components/gamification/ProgressBar.vue'

// Jauge de niveau : « Niveau 4 — Confirmé » + barre vers le seuil suivant
// + « 1 240 / 2 000 pts » formatés en français.
interface LevelMeterProps {
  level: number
  levelName: string
  points: number
  nextLevelAt: number
}

const props = defineProps<LevelMeterProps>()

const nf = new Intl.NumberFormat('fr-FR')

const current = computed<string>(() => nf.format(props.points))
const threshold = computed<string>(() => nf.format(props.nextLevelAt))
</script>

<template>
  <div class="flex flex-col gap-2">
    <div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
      <p class="text-sm font-medium text-ink-100">
        Niveau {{ level }} — {{ levelName }}
      </p>
      <p class="text-xs tabular-nums text-ink-500">
        {{ current }} / {{ threshold }} pts
      </p>
    </div>

    <ProgressBar
      :value="points"
      :max="nextLevelAt"
      tone="accent"
      size="lg"
      aria-label="Progression vers le niveau suivant"
    />
  </div>
</template>
