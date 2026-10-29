<script setup lang="ts">
import type { LeadPreview as LeadPreviewData } from '~~/shared/types'
import { apiFetch } from '~/composables/useApi'
import {
  COMPANION_OFFLINE_REASON,
  apiErrorMessage,
  useCompanion,
} from '~/composables/useCompanion'
import { useToast } from '~/composables/useToast'
import ProjectsLeadPreview from '~/components/projects/LeadPreview.vue'
import UiButton from '~/components/ui/UiButton.vue'
import UiIcon from '~/components/ui/UiIcon.vue'
import UiModal from '~/components/ui/UiModal.vue'

const props = defineProps<{ projectId: string }>()

// Le garde `loaded` de useCompanion garantit UNE SEULE requête
// /api/companion/status pour toute l'app, même après navigation.
const { status, canRunLocal, refresh, enqueueLead } = useCompanion()
const toast = useToast()

onMounted(() => {
  void refresh()
})

const open = ref(false)
const loadingPreview = ref(false)
const launching = ref(false)
const preview = ref<LeadPreviewData | null>(null)

/** Explique visuellement pourquoi le lancement est désactivé (null = dispo). */
const disabledReason = computed<string | null>(() => {
  if (canRunLocal.value) return null
  return status.value?.reason ?? COMPANION_OFFLINE_REASON
})

/**
 * Le bouton d'ouverture porte le lancement tant qu'il est possible ; hors
 * ligne il devient une simple consultation de l'aperçu (toujours disponible :
 * c'est un calcul sur la base).
 */
const openLabel = computed<string>(() =>
  canRunLocal.value ? 'Lancer la session LEAD' : 'Aperçu LEAD',
)

const openTitle = computed<string>(() =>
  disabledReason.value === null
    ? 'Préparer et lancer une session LEAD sur ce projet'
    : `Lancement indisponible — ${disabledReason.value} (l’aperçu reste consultable).`,
)

const launchTitle = computed<string>(() =>
  disabledReason.value === null
    ? 'Préparer et lancer une session LEAD sur ce projet'
    : `Lancement impossible — ${disabledReason.value}`,
)

async function openPreview(): Promise<void> {
  if (loadingPreview.value) return
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
      message: apiErrorMessage(err, 'Erreur inconnue.'),
    })
  } finally {
    loadingPreview.value = false
  }
}

async function launch(): Promise<void> {
  // Garde côté client : zéro requête tant que le Companion est hors ligne.
  if (!canRunLocal.value || launching.value) return
  launching.value = true
  try {
    const issue = await enqueueLead(props.projectId)
    if (issue.status === 'expired' || issue.status === 'failed') {
      toast.show({
        tone: 'error',
        title: 'Échec',
        message: `La commande n’a pas été mise en file (statut « ${issue.status} »).`,
      })
      return
    }
    open.value = false
    toast.show({
      tone: 'success',
      title: 'Commande envoyée',
      message: 'Le terminal va s’ouvrir sur ton poste.',
    })
  } catch (err) {
    toast.show({
      tone: 'error',
      title: 'Échec',
      message: apiErrorMessage(err, 'La session LEAD n’a pas pu démarrer.'),
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
      :loading="loadingPreview"
      :title="openTitle"
      @click="openPreview"
    >
      <UiIcon name="terminal" />
      {{ openLabel }}
    </UiButton>

    <div
      v-if="disabledReason"
      class="flex max-w-xs flex-col gap-0.5 text-right text-xs"
    >
      <p class="text-ink-500">Lancement indisponible — {{ disabledReason }}</p>
      <p class="text-ink-700">L’aperçu reste consultable.</p>
    </div>

    <UiModal :open="open" title="Session LEAD" size="lg" @close="closeModal">
      <ProjectsLeadPreview v-if="preview" :preview="preview" />

      <p v-if="disabledReason" class="mt-3 text-xs text-ink-500">
        Le Companion n’est pas en ligne sur ce poste — la session ne peut pas
        démarrer pour l’instant.
      </p>

      <template #footer>
        <p
          v-if="launching"
          class="mr-auto flex items-center gap-2 text-xs text-ink-500"
          role="status"
        >
          <span
            class="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-accent-400 border-t-transparent"
            aria-hidden="true"
          />
          En attente du Companion…
        </p>
        <UiButton variant="ghost" :disabled="launching" @click="closeModal">
          Annuler
        </UiButton>
        <UiButton
          :loading="launching"
          :disabled="!canRunLocal"
          :aria-disabled="canRunLocal ? undefined : 'true'"
          :title="launchTitle"
          @click="launch"
        >
          Lancer la session LEAD
        </UiButton>
      </template>
    </UiModal>
  </div>
</template>
