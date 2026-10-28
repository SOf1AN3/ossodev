<script setup lang="ts">
import { useProjects, type ProjectWithCounts } from '~/composables/useProjects'
import { useToast } from '~/composables/useToast'
import ProjectsScanStatus from '~/components/projects/ScanStatus.vue'
import UiButton from '~/components/ui/UiButton.vue'
import UiCard from '~/components/ui/UiCard.vue'
import UiEmptyState from '~/components/ui/UiEmptyState.vue'
import UiInput from '~/components/ui/UiInput.vue'
import UiModal from '~/components/ui/UiModal.vue'
import UiSkeleton from '~/components/ui/UiSkeleton.vue'
import UiToggle from '~/components/ui/UiToggle.vue'

useHead({ title: 'Projets — OSSO' })

const { listProjects, createProject } = useProjects()
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
  <div class="flex flex-col gap-6">
    <header class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 class="text-2xl font-semibold text-ink-100">Projets</h1>
        <p class="mt-1 text-sm text-ink-300">
          Les dossiers de ton espace dev, détectés par le pont local.
        </p>
      </div>
      <UiButton @click="openAddModal">+ Ajouter un projet</UiButton>
    </header>

    <ProjectsScanStatus @scanned="load" />

    <UiToggle v-model="includeArchived" label="Afficher les archivés" />

    <!-- Chargement -->
    <div
      v-if="loading"
      class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3"
      aria-busy="true"
      aria-label="Chargement des projets"
    >
      <UiCard v-for="n in 3" :key="n">
        <UiSkeleton class="h-24 w-full" />
      </UiCard>
    </div>

    <!-- Erreur -->
    <UiEmptyState
      v-else-if="loadError"
      icon="⚠️"
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
      icon="📁"
      title="Aucun projet détecté"
      description="Clique sur « Rescanner » après avoir déplacé tes dossiers dans le dossier dev."
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
        class="group flex flex-col gap-3 rounded-xl border border-line bg-surface-900 p-5 transition-colors hover:bg-surface-800 focus-visible:outline-2 focus-visible:outline-accent-400"
      >
        <div class="flex items-start justify-between gap-2">
          <h2
            class="min-w-0 truncate text-base font-medium text-ink-100 transition-colors group-hover:text-accent-400"
            :title="project.name"
          >
            {{ project.name }}
          </h2>
          <span
            v-if="project.is_archived"
            class="shrink-0 rounded-full bg-surface-700 px-2 py-0.5 text-xs text-ink-300"
          >
            archivé
          </span>
        </div>

        <p
          class="truncate text-xs text-ink-500"
          :title="project.folder_path"
        >
          {{ project.folder_path }}
        </p>

        <div>
          <div class="flex items-center justify-between text-xs text-ink-300">
            <span>{{ project.open_tasks }} à faire</span>
            <span>
              {{ project.done_tasks }}
              terminée{{ project.done_tasks > 1 ? 's' : '' }}
            </span>
            <span>{{ project.task_count }} au total</span>
          </div>
          <div
            class="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-surface-700"
            role="progressbar"
            :aria-valuenow="project.done_tasks"
            aria-valuemin="0"
            :aria-valuemax="project.task_count"
            :aria-label="`Progression de ${project.name}`"
          >
            <div
              class="h-full rounded-full bg-accent-400 transition-all"
              :style="{ width: `${progressPercent(project)}%` }"
            />
          </div>
        </div>

        <p class="text-xs text-ink-500">
          Dernier scan : {{ formatRelative(project.last_scan_at) }}
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
            Chemin absolu, ex. C:/Users/Sofiane/Desktop/dev/mon-projet
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
