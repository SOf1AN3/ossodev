<script setup lang="ts">
import { useProjects, type ProjectWithCounts } from '~/composables/useProjects'
import { useCompanion } from '~/composables/useCompanion'
import { useToast } from '~/composables/useToast'
import ProjectsScanStatus from '~/components/projects/ScanStatus.vue'
import UiBadge from '~/components/ui/UiBadge.vue'
import UiButton from '~/components/ui/UiButton.vue'
import UiEmptyState from '~/components/ui/UiEmptyState.vue'
import UiIcon from '~/components/ui/UiIcon.vue'
import UiInput from '~/components/ui/UiInput.vue'
import UiModal from '~/components/ui/UiModal.vue'
import UiSkeleton from '~/components/ui/UiSkeleton.vue'
import UiToggle from '~/components/ui/UiToggle.vue'

useHead({ title: 'Projets — OSSO' })

const { listProjects, createProject } = useProjects()
const { status: companionStatus, canRunLocal } = useCompanion()
const toast = useToast()

const projects = ref<ProjectWithCounts[]>([])
const loading = ref(true)
const loadError = ref<string | null>(null)
const includeArchived = ref(false)

const showAddModal = ref(false)
const newName = ref('')
const newFolderPath = ref('')
const creating = ref(false)

const canCreate = computed<boolean>(
  () => newName.value.trim() !== '' && newFolderPath.value.trim() !== '',
)

async function load(): Promise<void> {
  loading.value = true
  loadError.value = null
  try {
    projects.value = await listProjects(includeArchived.value)
  } catch (err) {
    projects.value = []
    loadError.value =
      err instanceof Error ? err.message : 'Impossible de charger les projets.'
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  void load()
})

watch(includeArchived, () => {
  void load()
})

function openAddModal(): void {
  newName.value = ''
  newFolderPath.value = ''
  showAddModal.value = true
}

async function submitCreate(): Promise<void> {
  if (!canCreate.value || creating.value) return
  creating.value = true
  try {
    const created = await createProject({
      name: newName.value.trim(),
      folder_path: newFolderPath.value.trim(),
    })
    toast.show({
      tone: 'success',
      title: 'Projet ajouté',
      message: `« ${created.name} » est maintenant suivi par OSSO.`,
    })
    showAddModal.value = false
    newName.value = ''
    newFolderPath.value = ''
    await load()
  } catch (err) {
    toast.show({
      tone: 'error',
      title: 'Ajout impossible',
      message: err instanceof Error ? err.message : 'Erreur inconnue.',
    })
  } finally {
    creating.value = false
  }
}

function progressPercent(project: ProjectWithCounts): number {
  if (project.task_count === 0) return 0
  return Math.round((project.done_tasks / project.task_count) * 100)
}

/**
 * État vide : on n'invite pas à rescanner si le Companion ne peut pas le faire.
 * `status === null` (vérification en cours) → on reste sur l'explication neutre.
 */
const emptyDescription = computed<string>(() => {
  if (companionStatus.value !== null && !canRunLocal.value) {
    return 'Le Companion n’est pas en ligne sur ce poste. Démarre-le, puis clique sur « Rescanner ».'
  }
  return 'Clique sur « Rescanner » après avoir déplacé tes dossiers dans le dossier dev.'
})

/** « il y a 2 h » / « jamais » — Intl ne couvre pas le relatif dans dates.ts. */
function formatRelative(iso: string | null): string {
  if (!iso) return 'jamais'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return 'jamais'
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
    <header class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 class="text-2xl font-semibold text-ink-100">Projets</h1>
        <p class="mt-1 text-sm text-ink-300">
          Les dossiers de ton espace dev, détectés par le Companion.
        </p>
      </div>

      <div class="flex flex-wrap items-center gap-5">
        <UiToggle v-model="includeArchived" label="Afficher les archivés" />
        <UiButton @click="openAddModal">
          <UiIcon name="plus" size="sm" />
          Ajouter un projet
        </UiButton>
      </div>
    </header>

    <ProjectsScanStatus @scanned="load" />

    <!-- Chargement -->
    <div
      v-if="loading"
      class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3"
      aria-busy="true"
      aria-label="Chargement des projets"
    >
      <div
        v-for="n in 3"
        :key="n"
        class="surface flex flex-col gap-3 px-5 py-4"
        aria-hidden="true"
      >
        <div class="flex items-center gap-3">
          <UiSkeleton class="h-9 w-9 shrink-0" />
          <div class="min-w-0 flex-1">
            <UiSkeleton class="h-4 w-1/2" />
            <UiSkeleton class="mt-2 h-3 w-3/4" />
          </div>
        </div>
        <UiSkeleton class="h-1 w-full" />
        <UiSkeleton class="h-3 w-1/3" />
      </div>
    </div>

    <!-- Erreur -->
    <UiEmptyState
      v-else-if="loadError"
      title="Impossible de charger les projets"
      :description="loadError"
    >
      <template #action>
        <UiButton @click="load">Réessayer</UiButton>
      </template>
    </UiEmptyState>

    <!-- Vide -->
    <UiEmptyState
      v-else-if="projects.length === 0"
      title="Aucun projet détecté"
      :description="emptyDescription"
    />

    <!-- Grille -->
    <div
      v-else
      class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3"
    >
      <NuxtLink
        v-for="project in projects"
        :key="project.id"
        :to="`/projets/${project.id}`"
        class="surface lift group flex flex-col gap-3 px-5 py-4 focus-visible:outline-2 focus-visible:outline-accent-400"
      >
        <div class="flex items-start gap-3">
          <span
            class="grid h-9 w-9 shrink-0 place-items-center rounded-sm border border-line bg-surface-800 text-ink-500 transition-colors group-hover:text-accent-400"
            aria-hidden="true"
          >
            <UiIcon name="folder" class="h-[19px] w-[19px]" />
          </span>

          <div class="min-w-0 flex-1">
            <div class="flex items-center justify-between gap-2">
              <h2
                class="min-w-0 truncate font-semibold text-ink-100 transition-colors group-hover:text-accent-400"
                :title="project.name"
              >
                {{ project.name }}
              </h2>
              <UiBadge v-if="project.is_archived" class="shrink-0">
                archivé
              </UiBadge>
            </div>
            <p
              class="mt-1 truncate font-mono text-[12px] text-ink-700"
              :title="project.folder_path"
            >
              {{ project.folder_path }}
            </p>
          </div>
        </div>

        <div class="flex items-center justify-between gap-3">
          <UiBadge tone="accent">
            <span class="tnum">{{ project.open_tasks }}</span>
            ouverte{{ project.open_tasks > 1 ? 's' : '' }}
          </UiBadge>
          <span class="tnum font-mono text-[11px] text-ink-700">
            {{ project.done_tasks }}/{{ project.task_count }}
          </span>
        </div>

        <div
          class="h-[4px] w-full overflow-hidden rounded-full bg-surface-600"
          role="progressbar"
          :aria-valuenow="project.done_tasks"
          aria-valuemin="0"
          :aria-valuemax="project.task_count"
          :aria-label="`Progression de ${project.name}`"
        >
          <div
            class="h-full rounded-full bg-accent-fill transition-all"
            :style="{ width: `${progressPercent(project)}%` }"
          />
        </div>

        <p class="micro text-ink-700">
          Dernier scan · {{ formatRelative(project.last_scan_at) }}
        </p>
      </NuxtLink>
    </div>

    <!-- Modal d'ajout -->
    <UiModal
      :open="showAddModal"
      title="Ajouter un projet"
      @close="showAddModal = false"
    >
      <form class="flex flex-col gap-4" @submit.prevent="submitCreate">
        <UiInput
          v-model="newName"
          label="Nom du projet"
          placeholder="Mon super projet"
        />
        <div>
          <UiInput
            v-model="newFolderPath"
            label="Chemin du dossier"
            placeholder="C:/Users/Sofiane/Desktop/dev/mon-projet"
          />
          <p class="mt-1.5 text-xs text-ink-500">
            Chemin absolu, ex.
            <span class="font-mono text-[12px] text-ink-700">
              C:/Users/Sofiane/Desktop/dev/mon-projet
            </span>
          </p>
        </div>
      </form>

      <template #footer>
        <UiButton variant="ghost" :disabled="creating" @click="showAddModal = false">
          Annuler
        </UiButton>
        <UiButton :loading="creating" :disabled="!canCreate" @click="submitCreate">
          Enregistrer
        </UiButton>
      </template>
    </UiModal>
  </div>
</template>
