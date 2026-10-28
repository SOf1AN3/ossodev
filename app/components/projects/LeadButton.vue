<script setup lang="ts">
import type { LeadPreview as LeadPreviewData } from '~~/shared/types'
import { apiFetch } from '~/composables/useApi'
import { useBridge } from '~/composables/useBridge'
import { useToast } from '~/composables/useToast'
import ProjectsLeadPreview from '~/components/projects/LeadPreview.vue'
import UiButton from '~/components/ui/UiButton.vue'
import UiModal from '~/components/ui/UiModal.vue'

interface LeadLaunchResult {
  preview: LeadPreviewData
  file: string
  clipboardCopied: boolean
  terminal: boolean
}

const props = defineProps<{ projectId: string }>()

const { canRunLocal, status, refresh } = useBridge()
const toast = useToast()

// Le garde `loaded` de useBridge garantit UNE SEULE requête /api/bridge/status
// pour toute l'app, même si l'on atterrit directement sur cette page.
onMounted(() => {
  void refresh()
})

const open = ref(false)
const loadingPreview = ref(false)
const launching = ref(false)
const preview = ref<LeadPreviewData | null>(null)

/** Explique visuellement pourquoi LEAD est désactivé (null = disponible). */
const disabledReason = computed<string | null>(() => {
  if (canRunLocal.value) return null
  return status.value?.reason ?? 'Le pont local n’est pas disponible.'
})

async function openPreview(): Promise<void> {
  // Garde côté client : jamais de requête si le pont est indisponible.
  if (!canRunLocal.value || loadingPreview.value) return
  loadingPreview.value = true
  try {
    preview.value = await apiFetch<LeadPreviewData>(
      `/api/projects/${props.projectId}/lead/preview`,
    )
    open.value = true
  } catch (err) {
    toast.show({
      tone: 'error',
      title: 'Aperçu LEAD indisponible',
      message: err instanceof Error ? err.message : 'Erreur inconnue.',
    })
  } finally {
    loadingPreview.value = false
  }
}

async function launch(): Promise<void> {
  if (!canRunLocal.value || launching.value) return
  launching.value = true
  try {
    const result = await apiFetch<LeadLaunchResult>(
      `/api/projects/${props.projectId}/lead`,
      { method: 'POST' },
    )
    open.value = false
    const clipboard = result.clipboardCopied
      ? 'Prompt copié dans le presse-papier.'
      : 'Copie automatique impossible — copie le prompt à la main depuis l’aperçu.'
    const terminal = result.terminal
      ? 'Un terminal s’est ouvert dans le dossier du projet.'
      : 'Ouvre un terminal dans le dossier du projet pour lancer la commande.'
    toast.show({
      tone: 'success',
      title: 'Session LEAD lancée',
      message: `${clipboard} ${terminal}`,
    })
  } catch (err) {
    toast.show({
      tone: 'error',
      title: 'Échec du lancement LEAD',
      message: err instanceof Error ? err.message : 'Erreur inconnue.',
    })
  } finally {
    launching.value = false
  }
}

function closeModal(): void {
  if (launching.value) return
  open.value = false
}
</script>

<template>
  <div class="flex flex-col items-end gap-1.5">
    <UiButton
      :disabled="!canRunLocal"
      :loading="loadingPreview"
      :title="
        disabledReason
          ? `LEAD indisponible : ${disabledReason}`
          : 'Préparer et lancer une session LEAD sur ce projet'
      "
      @click="openPreview"
    >
      <span aria-hidden="true">🚀</span>
      LEAD
    </UiButton>

    <p v-if="disabledReason" class="max-w-xs text-right text-xs text-ink-500">
      LEAD indisponible : {{ disabledReason }}
    </p>

    <UiModal :open="open" title="Session LEAD" size="lg" @close="closeModal">
      <ProjectsLeadPreview v-if="preview" :preview="preview" />

      <template #footer>
        <UiButton variant="ghost" :disabled="launching" @click="closeModal">
          Annuler
        </UiButton>
        <UiButton :loading="launching" @click="launch">
          Lancer la session LEAD
        </UiButton>
      </template>
    </UiModal>
  </div>
</template>
