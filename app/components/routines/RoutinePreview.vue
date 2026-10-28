<script setup lang="ts">
import { formatShortDate, fromISODate } from '~/utils/dates'

const props = defineProps<{
  /** Prochaines occurrences (`YYYY-MM-DD`), vide si inactive. */
  dates: string[]
  isActive: boolean
}>()

/** « lun. 3 nov. » pour la première occurrence, sinon null. */
const nextOccurrence = computed<string | null>(() => {
  const first = props.dates[0]
  if (!first) return null
  return formatShortDate(fromISODate(first))
})
</script>

<template>
  <p class="text-xs text-ink-500">
    <template v-if="!isActive">Routine inactive</template>
    <template v-else-if="nextOccurrence">
      Prochaine occurrence :
      <span class="text-accent-400">{{ nextOccurrence }}</span>
    </template>
    <template v-else>Aucune occurrence prévue</template>
  </p>
</template>
