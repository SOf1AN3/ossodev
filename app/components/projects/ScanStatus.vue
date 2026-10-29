<script setup lang="ts">
import {
  COMPANION_OFFLINE_REASON,
  apiErrorMessage,
  companionReasonDetail,
  useCompanion,
} from '~/composables/useCompanion'
import { apiFetch } from '~/composables/useApi'
import { useToast } from '~/composables/useToast'
import UiButton from '~/components/ui/UiButton.vue'

/** Réponse de `POST /api/brain/scan` : mise en file (le détail des erreurs reste optionnel). */
interface ScanIssue {
  errors?: string[]
}

const emit = defineEmits<{
  /** Émis après une mise en file réussie pour que la page recharge la liste. */
  scanned: []
}>()

const {
  status,
  pending: companionPending,
  canRunLocal,
  refresh,
} = useCompanion()
const toast = useToast()

const confirmStep = ref(false)
const scanning = ref(false)
const queued = ref(false)
const lastErrors = ref<string[]>([])
let reloadTimer: ReturnType<typeof setTimeout> | null = null

function clearReloadTimer(): void {
  if (reloadTimer !== null) {
    clearTimeout(reloadTimer)
    reloadTimer = null
  }
}

onMounted(() => {
  // Garde anti-double-appel côté store : zéro requête si déjà chargé.
  void refresh()
})

onUnmounted(() => {
  clearReloadTimer()
})

/** Voyant : vert si le Companion répond, rouge sinon, gris pendant la vérification. */
const beaconClasses = computed<string>(() => {
  if (status.value === null) return 'bg-ink-700'
  return canRunLocal.value
    ? 'bg-ok-400 [box-shadow:0_0_8px_0_var(--color-ok-400)]'
    : 'bg-danger-400'
})

/** Libellé d’instrument reflétant l’état courant du Companion. */
const stateLabel = computed<string>(() => {
  if (scanning.value) return 'Analyse en cours'
  if (queued.value) return 'Analyse en file'
  if (companionPending.value && status.value === null) {
    return 'Vérification du Companion'
  }
  if (status.value === null) return 'Présence du Companion inconnue'
  return canRunLocal.value ? 'Companion en ligne' : 'Companion hors ligne'
})

/** Explique visuellement pourquoi le rescanner est désactivé (null = dispo). */
const disabledReason = computed<string | null>(() => {
  if (canRunLocal.value) return null
  return status.value?.reason ?? COMPANION_OFFLINE_REASON
})

/**
 * Raison technique affichée en rouge — uniquement quand elle apporte quelque
 * chose au-delà de l'explication générique affichée sous le voyant.
 */
const detailReason = computed<string | null>(() => {
  if (canRunLocal.value || status.value === null) return null
  const detail = companionReasonDetail(status.value.reason)
  if (detail === null || detail === COMPANION_OFFLINE_REASON) return null
  // La ligne est autonome : on respecte la casse française.
  return detail.charAt(0).toUpperCase() + detail.slice(1)
})

/** Tooltip du bouton : toujours porteur du motif de désactivation. */
const rescanTitle = computed<string>(() =>
  canRunLocal.value
    ? 'Re-scanner le dossier dev pour détecter tes projets'
    : `Rescan impossible : ${disabledReason.value ?? COMPANION_OFFLINE_REASON}`,
)

/** Jamais de requête envoyée si le Companion est hors ligne. */
function startScan(): void {
  if (!canRunLocal.value || scanning.value || queued.value) return
  confirmStep.value = true
}

async function confirmScan(): Promise<void> {
  if (!canRunLocal.value || scanning.value) return
  confirmStep.value = false
  lastErrors.value = []
  scanning.value = true
  try {
    const report = await apiFetch<ScanIssue | undefined>('/api/brain/scan', {
      method: 'POST',
    })
    if (report !== undefined && Array.isArray(report.errors)) {
      lastErrors.value = report.errors
    }
    toast.show({
      tone: 'success',
      title: 'Analyse en file',
      message: 'Le Companion va scanner ton dossier dev.',
    })
    // La commande part sur le poste : on recharge tout de suite, puis à nouveau
    // quand le Companion a renvoyé son résultat au serveur.
    emit('scanned')
    queued.value = true
    clearReloadTimer()
    reloadTimer = setTimeout(() => {
      reloadTimer = null
      queued.value = false
      emit('scanned')
    }, 6000)
  } catch (err) {
    toast.show({
      tone: 'error',
      title: 'Échec de l’analyse',
      message: apiErrorMessage(err, 'Le scan du dossier dev a échoué.'),
    })
  } finally {
    scanning.value = false
  }
}
</script>

<template>
  <section
    aria-label="État du Companion"
    class="surface flex flex-wrap items-center justify-between gap-4 px-4 py-3"
  >
    <div class="flex min-w-0 items-center gap-3">
      <!-- Voyant -->
      <span
        class="h-2.5 w-2.5 shrink-0 rounded-full"
        :class="beaconClasses"
        aria-hidden="true"
      />

      <div class="min-w-0">
        <p class="micro text-ink-500">{{ stateLabel }}</p>

        <p
          v-if="companionPending && !status"
          class="mt-1 text-xs text-ink-500"
          role="status"
        >
          Vérification du Companion…
        </p>

        <p v-else-if="detailReason" class="mt-1 text-xs text-danger-400">
          {{ detailReason }}
        </p>

        <p v-else-if="canRunLocal" class="mt-1 text-xs text-ink-500">
          Prêt à scanner ton dossier dev.
        </p>
      </div>
    </div>

    <div class="flex flex-wrap items-center gap-2">
      <template v-if="scanning || queued">
        <span
          class="inline-block h-4 w-4 animate-spin rounded-full border-2 border-accent-400 border-t-transparent"
          aria-hidden="true"
        />
        <span class="micro text-ink-500" role="status">
          {{ scanning ? 'Analyse en cours' : 'Analyse en file — en attente du Companion' }}
        </span>
      </template>

      <template v-else-if="confirmStep">
        <span class="text-sm text-ink-300">
          Lancer le scan du dossier dev ?
        </span>
        <UiButton size="sm" @click="confirmScan">Confirmer</UiButton>
        <UiButton size="sm" variant="ghost" @click="confirmStep = false">
          Annuler
        </UiButton>
      </template>

      <UiButton
        v-else
        size="sm"
        variant="outline"
        :disabled="!canRunLocal"
        :aria-disabled="canRunLocal ? undefined : 'true'"
        :title="rescanTitle"
        @click="startScan"
      >
        Rescanner
      </UiButton>
    </div>

    <!-- Companion hors ligne : explication, pas seulement une couleur -->
    <p v-if="!canRunLocal && status !== null" class="w-full text-sm text-ink-500">
      Le Companion n’est pas en ligne sur ce poste. Démarre-le pour scanner ton
      dossier dev.
    </p>

    <ul
      v-if="lastErrors.length > 0"
      class="w-full rounded-sm border border-line bg-surface-800 px-3 py-2"
    >
      <li class="micro text-danger-400">
        Erreurs rencontrées pendant le scan
      </li>
      <li
        v-for="(scanError, i) in lastErrors"
        :key="i"
        class="mt-1 text-xs text-ink-300"
      >
        {{ scanError }}
      </li>
    </ul>
  </section>
</template>
