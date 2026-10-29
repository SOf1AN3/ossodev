<script setup lang="ts">
import UiBadge from '~/components/ui/UiBadge.vue'
import UiButton from '~/components/ui/UiButton.vue'
import UiEmptyState from '~/components/ui/UiEmptyState.vue'
import UiIcon from '~/components/ui/UiIcon.vue'
import UiModal from '~/components/ui/UiModal.vue'
import UiSkeleton from '~/components/ui/UiSkeleton.vue'
import UiToggle from '~/components/ui/UiToggle.vue'
import RoutineForm from '~/components/routines/RoutineForm.vue'
import RoutinePreview from '~/components/routines/RoutinePreview.vue'
import { useRoutines, type RoutineWithNext } from '~/composables/useRoutines'
import { useToast } from '~/composables/useToast'
import { WEEKDAYS_SHORT } from '~/utils/dates'
import type { RoutineInput } from '~~/shared/types'

useHead({ title: 'Routines — OSSO' })

const {
  routines,
  pending,
  error,
  load,
  createRoutine,
  updateRoutine,
  deleteRoutine,
} = useRoutines()

const toast = useToast()

const editorOpen = ref(false)
const editingRoutine = ref<RoutineWithNext | null>(null)
const saving = ref(false)

const deleteTarget = ref<RoutineWithNext | null>(null)
const deleting = ref(false)

onMounted(() => {
  void load()
})

/** « Tous les jours » ou « lun., mer., ven. » */
function frequencyLabel(routine: RoutineWithNext): string {
  if (routine.frequency === 'daily') return 'Tous les jours'
  const days = routine.weekdays ?? []
  if (days.length === 0) return 'Aucun jour'
  return [...days]
    .sort((a, b) => a - b)
    .map((day) => WEEKDAYS_SHORT[day] ?? '')
    .join(', ')
}

function openCreate(): void {
  editingRoutine.value = null
  editorOpen.value = true
}

function openEdit(routine: RoutineWithNext): void {
  editingRoutine.value = routine
  editorOpen.value = true
}

function closeEditor(): void {
  editorOpen.value = false
  editingRoutine.value = null
}

function reportError(err: unknown, fallback: string): void {
  const message = err instanceof Error && err.message ? err.message : fallback
  toast.show({ title: message, tone: 'error' })
}

async function onSave(input: RoutineInput): Promise<void> {
  if (saving.value) return
  saving.value = true
  try {
    if (editingRoutine.value) {
      await updateRoutine(editingRoutine.value.id, input)
      toast.show({ title: 'Routine mise à jour', tone: 'success' })
    } else {
      await createRoutine(input)
      toast.show({ title: 'Routine créée', tone: 'success' })
    }
    closeEditor()
  } catch (err) {
    reportError(err, "Impossible d'enregistrer la routine.")
  } finally {
    saving.value = false
  }
}

async function onToggleActive(
  routine: RoutineWithNext,
  value: boolean,
): Promise<void> {
  try {
    await updateRoutine(routine.id, { is_active: value })
    toast.show({
      title: value ? 'Routine activée' : 'Routine désactivée',
      tone: 'success',
    })
  } catch (err) {
    reportError(err, 'Impossible de changer le statut de la routine.')
  }
}

function askDelete(routine: RoutineWithNext): void {
  deleteTarget.value = routine
}

function closeDelete(): void {
  deleteTarget.value = null
}

async function confirmDelete(): Promise<void> {
  if (!deleteTarget.value) return
  deleting.value = true
  try {
    await deleteRoutine(deleteTarget.value.id)
    toast.show({ title: 'Routine supprimée', tone: 'success' })
    closeDelete()
  } catch (err) {
    reportError(err, 'Impossible de supprimer la routine.')
  } finally {
    deleting.value = false
  }
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <header class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 class="text-[30px] font-bold tracking-[-0.03em] text-ink-100">
          Routines
        </h1>
        <p class="mt-2 text-sm text-ink-300">
          Automatises tes tâches récurrentes.
        </p>
      </div>
      <UiButton @click="openCreate">
        <UiIcon name="plus" />
        Nouvelle routine
      </UiButton>
    </header>

    <!-- Erreur -->
    <div
      v-if="error"
      class="flex max-w-3xl flex-wrap items-center justify-between gap-3 rounded-md border border-danger-400/40 bg-danger-400/10 px-4 py-3"
      role="alert"
    >
      <p class="text-sm text-danger-400">{{ error }}</p>
      <UiButton size="sm" variant="outline" @click="load()">Réessayer</UiButton>
    </div>

    <!-- Chargement -->
    <div v-if="pending" class="flex flex-col gap-3" aria-busy="true">
      <UiSkeleton class="h-24 w-full" />
      <UiSkeleton class="h-24 w-full" />
      <UiSkeleton class="h-24 w-full" />
    </div>

    <!-- Vide -->
    <UiEmptyState
      v-else-if="routines.length === 0 && !error"
      title="Aucune routine."
      description="Crée un gabarit pour automatiser tes tâches quotidiennes."
    >
      <template #action>
        <UiButton @click="openCreate">Nouvelle routine</UiButton>
      </template>
    </UiEmptyState>

    <!-- Liste : cartes .surface lift -->
    <ul v-else class="flex flex-col gap-3">
      <li
        v-for="routine in routines"
        :key="routine.id"
        class="surface lift flex flex-wrap items-center justify-between gap-4 px-4 py-4"
      >
        <div class="min-w-0 flex-1">
          <div class="flex flex-wrap items-center gap-2">
            <h2 class="break-words text-sm font-medium text-ink-100">
              {{ routine.title }}
            </h2>
            <UiBadge :tone="routine.is_active ? 'ok' : 'neutral'">
              {{ routine.is_active ? 'Active' : 'Inactive' }}
            </UiBadge>
          </div>

          <div
            class="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-ink-500"
          >
            <span class="micro">{{ frequencyLabel(routine) }}</span>
            <span class="text-xs">
              <span class="tnum font-mono text-ink-300">
                {{ routine.points }}
              </span>
              pts
            </span>
          </div>

          <div class="mt-2">
            <RoutinePreview
              :dates="routine.next_dates"
              :is-active="routine.is_active"
            />
          </div>
        </div>

        <div class="flex flex-wrap items-center gap-3">
          <UiToggle
            :model-value="routine.is_active"
            :label="`Activer la routine ${routine.title}`"
            @update:model-value="
              (value: boolean) => onToggleActive(routine, value)
            "
          />
          <UiButton size="sm" variant="outline" @click="openEdit(routine)">
            Modifier
          </UiButton>
          <UiButton size="sm" variant="danger" @click="askDelete(routine)">
            Supprimer
          </UiButton>
        </div>
      </li>
    </ul>

    <!-- Modale création / édition -->
    <UiModal
      :open="editorOpen"
      :title="editingRoutine ? 'Modifier la routine' : 'Nouvelle routine'"
      size="md"
      @close="closeEditor"
    >
      <RoutineForm
        :routine="editingRoutine"
        :saving="saving"
        @save="onSave"
        @cancel="closeEditor"
      />
    </UiModal>

    <!-- Modale de confirmation de suppression -->
    <UiModal
      :open="deleteTarget !== null"
      title="Supprimer la routine"
      size="sm"
      @close="closeDelete"
    >
      <p class="text-sm text-ink-100">
        Supprimer la routine
        <span class="font-medium">« {{ deleteTarget?.title }} »</span> ?
      </p>
      <p class="mt-2 text-sm text-ink-300">
        Les occurrences passées seront conservées, les futures supprimées.
      </p>
      <template #footer>
        <UiButton variant="ghost" :disabled="deleting" @click="closeDelete">
          Annuler
        </UiButton>
        <UiButton variant="danger" :loading="deleting" @click="confirmDelete">
          Supprimer
        </UiButton>
      </template>
    </UiModal>
  </div>
</template>
