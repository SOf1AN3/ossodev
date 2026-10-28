<script setup lang="ts">
import type { Mission } from '~~/shared/types'
import { missionCreateSchema } from '~~/server/validation/missions'
import { useGamification } from '~/composables/useGamification'
import { useToast } from '~/composables/useToast'
import ProgressBar from '~/components/gamification/ProgressBar.vue'
import UiBadge from '~/components/ui/UiBadge.vue'
import UiButton from '~/components/ui/UiButton.vue'
import UiCard from '~/components/ui/UiCard.vue'
import UiInput from '~/components/ui/UiInput.vue'
import UiModal from '~/components/ui/UiModal.vue'

// Mission de la semaine sur le tableau de bord : affichage si elle existe,
// sinon création via une modale simple (titre + cible entière).
interface MissionSummaryProps {
  mission: Mission | null
  progress: number
  isCompleted: boolean
}

const props = defineProps<MissionSummaryProps>()

const { createMission } = useGamification()
const toast = useToast()

const showModal = ref(false)
const creating = ref(false)

const titleDraft = ref('')
const targetDraft = ref('')
const fieldErrors = ref<{ title?: string; target?: string }>({})

const targetPreview = computed<number | null>(() => {
  const raw = targetDraft.value.trim()
  if (raw === '') return null
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : null
})

function openModal(): void {
  titleDraft.value = ''
  targetDraft.value = ''
  fieldErrors.value = {}
  showModal.value = true
}

function closeModal(): void {
  if (creating.value) return
  showModal.value = false
}

async function submit(): Promise<void> {
  if (creating.value) return

  // Validation client via le schéma Zod existant (cible entière 1 → 1000).
  // `0` est le substitut de « cible absente » : le schéma renvoie le message.
  const parsed = missionCreateSchema.safeParse({
    title: titleDraft.value,
    target: targetPreview.value ?? 0,
  })

  if (!parsed.success) {
    const nextErrors: { title?: string; target?: string } = {}
    for (const issue of parsed.error.issues) {
      const field = issue.path[0]
      if (field === 'title' && nextErrors.title === undefined) {
        nextErrors.title = issue.message
      } else if (field === 'target' && nextErrors.target === undefined) {
        nextErrors.target = issue.message
      }
    }
    fieldErrors.value = nextErrors
    return
  }

  fieldErrors.value = {}
  creating.value = true
  try {
    const result = await createMission(parsed.data)
    showModal.value = false
    if (result === 'created') {
      toast.show({
        tone: 'success',
        title: 'Mission créée',
        message: `« ${parsed.data.title} » — objectif ${parsed.data.target} tâches.`,
      })
    } else {
      // 400 « mission déjà existante » : la mission a été rechargée côté
      // composable, aucun message d'erreur à afficher.
      toast.show({
        tone: 'info',
        title: 'Mission déjà en cours',
        message: 'Une mission existe déjà pour cette semaine.',
      })
    }
  } catch (err) {
    toast.show({
      tone: 'error',
      title: 'Création impossible',
      message: err instanceof Error ? err.message : 'Erreur inconnue.',
    })
  } finally {
    creating.value = false
  }
}
</script>

<template>
  <UiCard>
    <template #header>
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="min-w-0">
          <p class="text-xs uppercase tracking-wide text-ink-500">
            Mission de la semaine
          </p>
          <h2
            v-if="props.mission"
            class="mt-1 truncate text-base font-medium text-ink-100"
          >
            {{ props.mission.title }}
          </h2>
        </div>

        <UiBadge v-if="props.mission && props.isCompleted" tone="ok">
          ✅ Réussie
        </UiBadge>
      </div>
    </template>

    <!-- Mission en cours -->
    <template v-if="props.mission">
      <ProgressBar
        :value="props.progress"
        :max="props.mission.target"
        :label="`${props.progress} / ${props.mission.target} tâches`"
        show-percent
        :tone="props.isCompleted ? 'ok' : 'accent'"
      />
      <p class="mt-3 text-xs text-ink-500">
        Objectif hebdomadaire de {{ props.mission.target }} tâches.
      </p>
    </template>

    <!-- Aucune mission : action de création -->
    <div v-else class="flex flex-col items-start gap-3">
      <p class="text-sm text-ink-300">
        Donne un cap à ta semaine : choisis un objectif et un nombre de tâches.
      </p>
      <UiButton @click="openModal">Définir la mission de la semaine</UiButton>
    </div>

    <!-- Modale de création -->
    <UiModal
      :open="showModal"
      title="Définir la mission de la semaine"
      @close="closeModal"
    >
      <form class="flex flex-col gap-4" @submit.prevent="submit">
        <div>
          <UiInput
            v-model="titleDraft"
            label="Titre"
            placeholder="Ex. Finir le module de comptabilité"
            @enter="submit"
          />
          <p v-if="fieldErrors.title" class="mt-1.5 text-xs text-danger-400">
            {{ fieldErrors.title }}
          </p>
        </div>

        <div>
          <UiInput
            v-model="targetDraft"
            label="Cible (nombre de tâches)"
            type="number"
            placeholder="Ex. 10"
            @enter="submit"
          />
          <p v-if="fieldErrors.target" class="mt-1.5 text-xs text-danger-400">
            {{ fieldErrors.target }}
          </p>
          <p v-else class="mt-1.5 text-xs text-ink-500">
            Nombre entier de 1 à 1000.
          </p>
        </div>
      </form>

      <template #footer>
        <UiButton variant="ghost" :disabled="creating" @click="closeModal">
          Annuler
        </UiButton>
        <UiButton :loading="creating" @click="submit">
          Créer la mission
        </UiButton>
      </template>
    </UiModal>
  </UiCard>
</template>
