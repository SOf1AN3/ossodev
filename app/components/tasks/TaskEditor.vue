<script setup lang="ts">
import UiButton from '~/components/ui/UiButton.vue'
import UiInput from '~/components/ui/UiInput.vue'
import UiModal from '~/components/ui/UiModal.vue'
import UiTextarea from '~/components/ui/UiTextarea.vue'
import type { TaskStatus } from '~~/shared/types'
import type { TaskPatch, TaskWithOverdue } from '~/composables/useTasks'

const props = defineProps<{
  open: boolean
  task: TaskWithOverdue | null
  /** Sauvegarde en cours : bloque la ré-émission et affiche le spinner. */
  saving?: boolean
}>()

const emit = defineEmits<{
  close: []
  save: [patch: TaskPatch]
}>()

const title = ref('')
const notes = ref('')
const priority = ref(2)
const status = ref<TaskStatus>('todo')
const scheduledDate = ref('')

const priorityOptions: Array<{ value: number; label: string }> = [
  { value: 1, label: 'Haute' },
  { value: 2, label: 'Normale' },
  { value: 3, label: 'Basse' },
]

const statusOptions: Array<{ value: TaskStatus; label: string }> = [
  { value: 'todo', label: 'À faire' },
  { value: 'doing', label: 'En cours' },
  { value: 'done', label: 'Validée' },
]

const canSave = computed<boolean>(
  () =>
    props.open &&
    props.saving !== true &&
    title.value.trim().length > 0,
)

// Recopie les valeurs de la tâche à chaque ouverture de la modale.
watch(
  () => props.open,
  (isOpen) => {
    if (!isOpen || !props.task) return
    title.value = props.task.title
    notes.value = props.task.notes ?? ''
    priority.value = props.task.priority
    status.value = props.task.status
    scheduledDate.value = props.task.scheduled_date
  },
)

function onSubmit(): void {
  if (!canSave.value) return
  emit('save', {
    title: title.value.trim(),
    notes: notes.value.trim().length > 0 ? notes.value.trim() : null,
    priority: priority.value,
    status: status.value,
    scheduled_date: scheduledDate.value,
  })
}
</script>

<template>
  <UiModal
    :open="open"
    :title="task ? 'Modifier la tâche' : 'Modifier'"
    size="md"
    @close="emit('close')"
  >
    <form class="flex flex-col gap-4" @submit.prevent="onSubmit">
      <UiInput v-model="title" label="Titre" placeholder="Titre de la tâche" />

      <UiTextarea
        v-model="notes"
        label="Notes"
        placeholder="Notes (facultatif)"
        :rows="3"
      />

      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div class="flex flex-col gap-1.5">
          <label
            for="task-editor-priority"
            class="micro text-ink-500"
          >
            Priorité
          </label>
          <div class="field">
            <select
              id="task-editor-priority"
              v-model.number="priority"
              class="w-full rounded-sm border border-line bg-surface-800 px-3 py-2 text-sm text-ink-100 focus-visible:outline-2 focus-visible:outline-accent-400"
            >
              <option
                v-for="option in priorityOptions"
                :key="option.value"
                :value="option.value"
              >
                {{ option.label }}
              </option>
            </select>
          </div>
        </div>

        <div class="flex flex-col gap-1.5">
          <label
            for="task-editor-status"
            class="micro text-ink-500"
          >
            Statut
          </label>
          <div class="field">
            <select
              id="task-editor-status"
              v-model="status"
              class="w-full rounded-sm border border-line bg-surface-800 px-3 py-2 text-sm text-ink-100 focus-visible:outline-2 focus-visible:outline-accent-400"
            >
              <option
                v-for="option in statusOptions"
                :key="option.value"
                :value="option.value"
              >
                {{ option.label }}
              </option>
            </select>
          </div>
        </div>
      </div>

      <UiInput
        v-model="scheduledDate"
        type="date"
        label="Date planifiée"
      />
    </form>

    <template #footer>
      <UiButton variant="ghost" :disabled="saving" @click="emit('close')">
        Annuler
      </UiButton>
      <UiButton :disabled="!canSave" :loading="saving" @click="onSubmit">
        Enregistrer
      </UiButton>
    </template>
  </UiModal>
</template>
