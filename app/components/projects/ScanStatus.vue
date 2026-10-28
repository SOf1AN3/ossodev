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

function plural(count: number, word: string): string {
  return `${count} ${word}${count > 1 ? 's' : ''}`
}

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
    class="rounded-xl border border-line bg-surface-900 p-4"
  >
    <div class="flex flex-wrap items-center justify-between gap-4">
      <div class="min-w-0">
        <p class="text-sm font-medium text-ink-100">Pont local</p>

        <p v-if="bridgePending && !status" class="mt-0.5 text-sm text-ink-300">
          Vérification du pont…
        </p>

        <template v-else-if="status">
          <p v-if="canRunLocal" class="mt-0.5 text-sm text-ink-300">
            Pont local actif<template v-if="status.devRootPath">
              — dossier dev :
              <code class="rounded bg-surface-800 px-1 text-xs text-ink-100">
                {{ status.devRootPath }}
              </code>
            </template>.
          </p>
          <p v-else class="mt-0.5 text-sm text-danger-400">
            Rescan indisponible : {{ status.reason ?? 'raison inconnue' }}.
          </p>
        </template>

        <p v-else-if="bridgeError" class="mt-0.5 text-sm text-danger-400">
          {{ bridgeError }}
        </p>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <template v-if="scanning">
          <span
            class="inline-block h-4 w-4 animate-spin rounded-full border-2 border-accent-400 border-t-transparent"
            aria-hidden="true"
          />
          <span class="text-sm text-ink-300" role="status">
            Analyse en cours…
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
              : `Rescan impossible : ${status?.reason ?? 'le pont local n’est pas accessible depuis cette version de l’application'}.`
          "
          @click="startScan"
        >
          Rescanner le dossier dev
        </UiButton>
      </div>
    </div>

    <ul
      v-if="lastErrors.length > 0"
      class="mt-3 flex flex-col gap-1 rounded-lg border border-line bg-surface-800 px-3 py-2"
    >
      <li class="text-xs font-medium text-danger-400">
        Erreurs rencontrées pendant le scan :
      </li>
      <li
        v-for="(scanError, i) in lastErrors"
        :key="i"
        class="text-xs text-ink-300"
      >
        {{ scanError }}
      </li>
    </ul>
  </section>
</template>
