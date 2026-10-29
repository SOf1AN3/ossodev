<script setup lang="ts">
import { useBridge } from '~/composables/useBridge'
import { useToast } from '~/composables/useToast'
import UiButton from '~/components/ui/UiButton.vue'

const emit = defineEmits<{
  /** Émis après un scan réussi pour que la page recharge la liste. */
  scanned: []
}>()

const { status, pending: bridgePending, error: bridgeError, canRunLocal, refresh, scan, scanning } = useBridge()
const toast = useToast()

const confirmStep = ref(false)
const lastErrors = ref<string[]>([])

onMounted(() => {
  void refresh()
})

/** Voyant : vert si le pont répond, rouge sinon. */
const beaconClasses = computed<string>(() =>
  canRunLocal.value
    ? 'bg-ok-400 [box-shadow:0_0_8px_0_var(--color-ok-400)]'
    : 'bg-danger-400',
)

/** Libellé d’instrument reflétant l’état courant du pont. */
const stateLabel = computed<string>(() => {
  if (scanning.value) return 'Scan en cours'
  if (bridgePending.value && status.value === null) return 'Vérification du pont'
  if (status.value === null) {
    return bridgeError.value !== null ? 'Pont local injoignable' : 'Pont local inconnu'
  }
  return canRunLocal.value ? 'Pont local actif' : 'Rescan indisponible'
})

/** Explique visuellement pourquoi le rescanner est désactivé (null = ok). */
const disabledReason = computed<string | null>(() => {
  if (canRunLocal.value) return null
  return status.value?.reason ?? 'Le pont local n’est pas disponible.'
})

function plural(count: number, word: string): string {
  return `${count} ${word}${count > 1 ? 's' : ''}`
}

/** Jamais de requête envoyée si le pont est indisponible. */
function startScan(): void {
  if (!canRunLocal.value || scanning.value) return
  confirmStep.value = true
}

async function confirmScan(): Promise<void> {
  if (!canRunLocal.value) return
  confirmStep.value = false
  lastErrors.value = []
  try {
    const report = await scan()
    toast.show({
      tone: 'success',
      title: 'Scan terminé',
      message: `${plural(report.scanned, 'dossier scanné')}, ${plural(report.detected, 'projet détecté')}, ${plural(report.added, 'ajouté')}.`,
    })
    lastErrors.value = report.errors
    emit('scanned')
  } catch (err) {
    toast.show({
      tone: 'error',
      title: 'Échec du scan',
      message: err instanceof Error ? err.message : 'Erreur inconnue.',
    })
  }
}
</script>

<template>
  <section
    aria-label="État du pont local"
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
          v-if="bridgePending && !status"
          class="mt-1 text-xs text-ink-500"
          role="status"
        >
          Vérification du pont…
        </p>

        <p
          v-else-if="canRunLocal && status?.devRootPath"
          class="mt-1 truncate font-mono text-[12px] text-ink-700"
          :title="status.devRootPath"
        >
          {{ status.devRootPath }}
        </p>

        <p v-else-if="!canRunLocal && disabledReason" class="mt-1 text-xs text-danger-400">
          {{ disabledReason }}
        </p>

        <p v-else-if="bridgeError" class="mt-1 text-xs text-danger-400">
          {{ bridgeError }}
        </p>
      </div>
    </div>

    <div class="flex flex-wrap items-center gap-2">
      <template v-if="scanning">
        <span
          class="inline-block h-4 w-4 animate-spin rounded-full border-2 border-accent-400 border-t-transparent"
          aria-hidden="true"
        />
        <span class="micro text-ink-500" role="status">
          Analyse en cours
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
        :title="
          canRunLocal
            ? 'Re-scanner le dossier dev pour détecter tes projets'
            : `Rescan impossible : ${disabledReason ?? 'le pont local n’est pas accessible.'}.`
        "
        @click="startScan"
      >
        Rescanner
      </UiButton>
    </div>

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
