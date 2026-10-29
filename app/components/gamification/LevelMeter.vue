<script setup lang="ts">
import ProgressBar from '~/components/gamification/ProgressBar.vue'

// Jauge de niveau : « NIVEAU » (micro) + chiffre display + rang accent,
// + barre vers le seuil suivant et « 1 240 / 2 000 pts » en mono.
interface LevelMeterProps {
  level: number
  levelName: string
  points: number
  nextLevelAt: number
}

const props = defineProps<LevelMeterProps>()

const nf = new Intl.NumberFormat('fr-FR')

const levelText = computed<string>(() => nf.format(props.level))
const current = computed<string>(() => nf.format(props.points))
const threshold = computed<string>(() => nf.format(props.nextLevelAt))
</script>

<template>
  <div class="flex flex-col gap-2.5">
    <div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
      <p class="flex items-baseline gap-2.5">
        <span class="micro text-ink-700">Niveau</span>
        <span class="tnum display text-[28px] text-ink-100">{{ levelText }}</span>
        <span class="text-[14px] font-medium text-accent-400">{{ levelName }}</span>
      </p>
      <p class="tnum font-mono text-[12px] text-ink-700">
        {{ current }} / {{ threshold }} pts
      </p>
    </div>

    <ProgressBar
      :value="points"
      :max="nextLevelAt"
      tone="accent"
      aria-label="Progression vers le niveau suivant"
    />
  </div>
</template>
