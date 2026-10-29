<script setup lang="ts">
import type { Mission } from '~~/shared/types'
import { missionCreateSchema } from '~~/server/validation/missions'
import { useGamification } from '~/composables/useGamification'
import { useToast } from '~/composables/useToast'
import UiBadge from '~/components/ui/UiBadge.vue'
import UiButton from '~/components/ui/UiButton.vue'
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

/** Avancement de la mission, 0 → 100. */
const percent = computed<number>(() => {
  const mission = props.mission
  if (mission === null || mission.target <= 0) return 0
  return Math.max(
    0,
    Math.min(100, Math.round((props.progress / mission.target) * 100)),
  )
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
  <section class="flex flex-col gap-4" aria-labelledby="mission-title">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <h2
        id="mission-title"
        class="text-[19px] font-semibold tracking-[-0.01em] text-ink-100"
      >
        Mission de la semaine
      </h2>
      <UiBadge v-if="props.mission !== null && props.isCompleted" tone="ok">
        Réussie
      </UiBadge>
    </div>

    <!-- Mission en cours -->
    <div v-if="props.mission !== null" class="surface lift px-5 py-4">
      <p class="truncate text-[15px] font-medium text-ink-100">
        {{ props.mission.title }}
      </p>

      <div
        class="mt-3 h-[5px] w-full overflow-hidden rounded-full bg-surface-600"
        role="progressbar"
        :aria-valuenow="percent"
        aria-valuemin="0"
        aria-valuemax="100"
        :aria-label="`Progression de la mission ${props.mission.title}`"
      >
        <div
          class="h-full rounded-full"
          :class="props.isCompleted ? 'bg-ok-400' : 'bg-accent-fill'"
          :style="{
            width: `${percent}%`,
            transition: 'width 600ms var(--ease-in-out)',
          }"
        />
      </div>

      <div class="mt-2.5 flex items-baseline justify-between gap-3">
        <p class="tnum font-mono text-[12px] text-ink-700">
          {{ props.progress }} / {{ props.mission.target }} tâches
        </p>
        <p class="text-[12px] text-ink-700">Objectif hebdomadaire</p>
      </div>
    </div>

    <!-- Aucune mission : action de création -->
    <div
      v-else
      class="surface lift flex flex-col items-start gap-3 px-5 py-4"
    >
      <p class="text-sm text-ink-300">
        Donne un cap à ta semaine : choisis un objectif et un nombre de tâches.
      </p>
      <UiButton @click="openModal">Définir la mission</UiButton>
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
  </section>
</template>
