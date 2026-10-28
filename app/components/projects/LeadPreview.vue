<script setup lang="ts">
import type { LeadPreview } from '~~/shared/types'
import UiBadge from '~/components/ui/UiBadge.vue'

defineProps<{ preview: LeadPreview }>()

const TACHES_PLACEHOLDER = '{{TACHES}}'
</script>

<template>
  <div class="flex flex-col gap-3">
    <div class="flex flex-wrap items-center gap-2">
      <UiBadge tone="accent">{{ preview.projectName }}</UiBadge>
      <UiBadge>
        {{ preview.taskCount }}
        tâche{{ preview.taskCount > 1 ? 's' : '' }}
      </UiBadge>
      <UiBadge :tone="preview.placeholderFound ? 'ok' : 'neutral'">
        {{ preview.placeholderFound ? 'Marqueur présent' : 'Marqueur absent' }}
      </UiBadge>
    </div>

    <p class="text-sm text-ink-300">
      Dossier :
      <code class="rounded bg-surface-800 px-1 text-xs text-ink-100">
        {{ preview.folderPath }}
      </code>
    </p>

    <p
      v-if="preview.taskCount === 0"
      class="rounded-lg border border-line bg-surface-800 px-3 py-2 text-sm text-ink-300"
    >
      Aucune tâche dans ce projet — le prompt partira sans liste.
    </p>

    <p
      v-if="!preview.placeholderFound"
      class="rounded-lg border border-line bg-surface-800 px-3 py-2 text-xs text-ink-300"
    >
      Marqueur {{ TACHES_PLACEHOLDER }} introuvable dans le modèle : la liste
      des tâches sera ajoutée en fin de message.
    </p>

    <div>
      <p class="mb-1.5 text-sm text-ink-300">Aperçu du prompt</p>
      <pre
        class="max-h-96 overflow-auto rounded-lg border border-line bg-surface-800 p-3 text-xs whitespace-pre-wrap text-ink-100"
      >{{ preview.prompt }}</pre>
    </div>

    <p class="text-xs text-ink-500">
      Le prompt sera copié dans le presse-papier et un terminal s’ouvrira dans
      le dossier du projet.
    </p>
  </div>
</template>
