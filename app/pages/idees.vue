<script setup lang="ts">
import type { Idea } from '~~/shared/types'
import { useIdeas } from '~/composables/useIdeas'
import { useToast } from '~/composables/useToast'
import UiButton from '~/components/ui/UiButton.vue'
import UiEmptyState from '~/components/ui/UiEmptyState.vue'
import UiIcon from '~/components/ui/UiIcon.vue'
import UiInput from '~/components/ui/UiInput.vue'
import UiModal from '~/components/ui/UiModal.vue'
import UiSkeleton from '~/components/ui/UiSkeleton.vue'
import UiTextarea from '~/components/ui/UiTextarea.vue'

useHead({ title: 'Idées — OSSO' })

const { listIdeas, createIdea, updateIdea, deleteIdea } = useIdeas()
const toast = useToast()

const ideas = ref<Idea[]>([])
const loading = ref(true)
const loadError = ref<string | null>(null)

// Création permanente
const newTitle = ref('')
const showDescription = ref(false)
const newDescription = ref('')
const creating = ref(false)

// Édition
const editing = ref<Idea | null>(null)
const editTitle = ref('')
const editDescription = ref('')
const savingEdit = ref(false)

// Suppression (confirmation en ligne)
const confirmingId = ref<string | null>(null)

// Expansion des descriptions
const expandedIds = ref<string[]>([])

const sortedIdeas = computed<Idea[]>(() =>
  [...ideas.value].sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  ),
)

onMounted(() => {
  void load()
})

async function load(): Promise<void> {
  loading.value = true
  loadError.value = null
  try {
    ideas.value = await listIdeas()
  } catch (err) {
    ideas.value = []
    loadError.value =
      err instanceof Error ? err.message : 'Impossible de charger les idées.'
  } finally {
    loading.value = false
  }
}

async function submitCreate(): Promise<void> {
  const title = newTitle.value.trim()
  if (title === '' || creating.value) return
  creating.value = true
  try {
    const created = await createIdea({
      title,
      description: newDescription.value.trim() || null,
    })
    ideas.value = [created, ...ideas.value]
    newTitle.value = ''
    newDescription.value = ''
    showDescription.value = false
    toast.show({
      tone: 'success',
      title: 'Idée enregistrée',
      message: `« ${created.title} » est au safe.`,
    })
  } catch (err) {
    toast.show({
      tone: 'error',
      title: 'Enregistrement impossible',
      message: err instanceof Error ? err.message : 'Erreur inconnue.',
    })
  } finally {
    creating.value = false
  }
}

function openEdit(idea: Idea): void {
  editing.value = idea
  editTitle.value = idea.title
  editDescription.value = idea.description ?? ''
}

function closeEdit(): void {
  editing.value = null
}

async function submitEdit(): Promise<void> {
  const target = editing.value
  if (!target || savingEdit.value) return
  const title = editTitle.value.trim()
  if (title === '') return
  savingEdit.value = true
  try {
    const updated = await updateIdea(target.id, {
      title,
      description: editDescription.value.trim() || null,
    })
    ideas.value = ideas.value.map((idea) => (idea.id === updated.id ? updated : idea))
    closeEdit()
    toast.show({
      tone: 'success',
      title: 'Idée mise à jour',
      message: `« ${updated.title} »`,
    })
  } catch (err) {
    toast.show({
      tone: 'error',
      title: 'Mise à jour impossible',
      message: err instanceof Error ? err.message : 'Erreur inconnue.',
    })
  } finally {
    savingEdit.value = false
  }
}

async function confirmDelete(idea: Idea): Promise<void> {
  try {
    await deleteIdea(idea.id)
    ideas.value = ideas.value.filter((i) => i.id !== idea.id)
    confirmingId.value = null
    toast.show({
      tone: 'success',
      title: 'Idée supprimée',
      message: `« ${idea.title} »`,
    })
  } catch (err) {
    toast.show({
      tone: 'error',
      title: 'Suppression impossible',
      message: err instanceof Error ? err.message : 'Erreur inconnue.',
    })
  }
}

function toggleExpand(id: string): void {
  expandedIds.value = expandedIds.value.includes(id)
    ? expandedIds.value.filter((x) => x !== id)
    : [...expandedIds.value, id]
}

/** « il y a 3 jours » — Intl.RelativeTimeFormat, FR. */
function formatRelative(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return 'à une date inconnue'
  const rtf = new Intl.RelativeTimeFormat('fr-FR', { numeric: 'auto' })
  const diffMinutes = Math.round((date.getTime() - Date.now()) / 60000)
  if (Math.abs(diffMinutes) < 60) {
    return rtf.format(diffMinutes, 'minute')
  }
  const diffHours = Math.round(diffMinutes / 60)
  if (Math.abs(diffHours) < 24) {
    return rtf.format(diffHours, 'hour')
  }
  return rtf.format(Math.round(diffHours / 24), 'day')
}
</script>

<template>
  <div class="page-enter flex flex-col gap-6">
    <header>
      <h1 class="text-2xl font-semibold text-ink-100">Idées</h1>
      <p class="mt-1 text-sm text-ink-300">
        Note tes idées ici avant de les perdre — elles deviendront peut-être
        des projets.
      </p>
    </header>

    <!-- Zone de création permanente -->
    <section
      aria-label="Ajouter une idée"
      class="surface lift px-4 py-3.5"
    >
      <form class="flex flex-col gap-4" @submit.prevent="submitCreate">
        <!-- .field : trait ambre qui se déploie au focus -->
        <div class="field">
          <UiInput
            v-model="newTitle"
            label="Nouvelle idée"
            placeholder="Titre de l’idée, puis Entrée pour enregistrer…"
            @enter="submitCreate"
          />
        </div>

        <div v-if="showDescription">
          <UiTextarea
            v-model="newDescription"
            label="Description (optionnelle)"
            :rows="3"
            placeholder="Pourquoi cette idée est bonne ?"
          />
        </div>

        <div class="flex flex-wrap items-center justify-between gap-3">
          <UiButton
            v-if="!showDescription"
            variant="ghost"
            size="sm"
            @click="showDescription = true"
          >
            <UiIcon name="plus" size="sm" />
            Ajouter une description
          </UiButton>
          <span v-else class="text-xs text-ink-500">
            Entrée dans le titre pour enregistrer directement.
          </span>

          <UiButton
            type="submit"
            :loading="creating"
            :disabled="newTitle.trim() === ''"
          >
            Enregistrer
          </UiButton>
        </div>
      </form>
    </section>

    <!-- Chargement -->
    <div
      v-if="loading"
      class="surface flex flex-col gap-3 px-4 py-4"
      aria-busy="true"
      aria-label="Chargement des idées"
    >
      <UiSkeleton v-for="n in 3" :key="n" class="h-14 w-full" />
    </div>

    <!-- Erreur -->
    <UiEmptyState
      v-else-if="loadError"
      title="Impossible de charger les idées"
      :description="loadError"
    >
      <template #action>
        <UiButton @click="load">Réessayer</UiButton>
      </template>
    </UiEmptyState>

    <!-- Vide -->
    <UiEmptyState
      v-else-if="sortedIdeas.length === 0"
      title="Aucune idée pour l’instant"
      description="Note-la avant de la perdre."
    />

    <!-- Liste -->
    <ul v-else class="surface overflow-hidden" aria-label="Idées enregistrées">
      <li
        v-for="idea in sortedIdeas"
        :key="idea.id"
        class="rounded-xs border-b border-line px-3 py-3 transition-colors last:border-b-0 hover:bg-surface-800"
      >
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div class="min-w-0 flex-1">
            <h2 class="font-medium text-ink-100">{{ idea.title }}</h2>
            <p
              v-if="idea.description"
              class="mt-1 line-clamp-2 text-[13px] text-ink-500"
              :title="idea.description"
            >
              {{ idea.description }}
            </p>
            <p class="micro mt-1.5 text-ink-700">
              Créée {{ formatRelative(idea.created_at) }}
            </p>
          </div>

          <div class="flex shrink-0 items-center gap-1">
            <template v-if="confirmingId === idea.id">
              <span class="text-xs text-danger-400">Supprimer ?</span>
              <UiButton
                size="sm"
                variant="danger"
                @click="confirmDelete(idea)"
              >
                Confirmer
              </UiButton>
              <UiButton
                size="sm"
                variant="ghost"
                @click="confirmingId = null"
              >
                Annuler
              </UiButton>
            </template>

            <template v-else>
              <button
                type="button"
                class="rounded-xs p-1.5 text-ink-500 transition-colors hover:bg-surface-700 hover:text-ink-100"
                aria-label="Éditer l’idée"
                :title="`Éditer : ${idea.title}`"
                @click="openEdit(idea)"
              >
                <UiIcon name="pencil" />
              </button>
              <button
                type="button"
                class="rounded-xs p-1.5 text-ink-500 transition-colors hover:bg-surface-700 hover:text-danger-400"
                aria-label="Supprimer l’idée"
                :title="`Supprimer : ${idea.title}`"
                @click="confirmingId = idea.id"
              >
                <UiIcon name="trash" />
              </button>
            </template>
          </div>
        </div>

        <button
          v-if="idea.description"
          type="button"
          class="mt-1.5 rounded-xs text-xs text-accent-400 transition-colors hover:text-ink-100"
          :aria-expanded="expandedIds.includes(idea.id)"
          @click="toggleExpand(idea.id)"
        >
          {{ expandedIds.includes(idea.id) ? 'Réduire' : 'Afficher la description entière' }}
        </button>

        <p
          v-if="idea.description && expandedIds.includes(idea.id)"
          class="mt-1.5 text-sm whitespace-pre-wrap text-ink-300"
        >
          {{ idea.description }}
        </p>
      </li>
    </ul>

    <!-- Modal d'édition -->
    <UiModal
      :open="editing !== null"
      title="Éditer l’idée"
      @close="closeEdit"
    >
      <form class="flex flex-col gap-4" @submit.prevent="submitEdit">
        <UiInput v-model="editTitle" label="Titre" />
        <UiTextarea
          v-model="editDescription"
          label="Description"
          :rows="4"
          placeholder="Décris ton idée…"
        />
      </form>

      <template #footer>
        <UiButton variant="ghost" :disabled="savingEdit" @click="closeEdit">
          Annuler
        </UiButton>
        <UiButton
          :loading="savingEdit"
          :disabled="editTitle.trim() === ''"
          @click="submitEdit"
        >
          Enregistrer
        </UiButton>
      </template>
    </UiModal>
  </div>
</template>
