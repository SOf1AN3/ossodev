<script setup lang="ts">
import type { Idea } from '~~/shared/types'
import { ideaCreateSchema } from '~~/server/validation/ideas'
import { apiFetch } from '~/composables/useApi'
import { useToast } from '~/composables/useToast'
import UiButton from '~/components/ui/UiButton.vue'
import UiCard from '~/components/ui/UiCard.vue'
import UiInput from '~/components/ui/UiInput.vue'
import UiSkeleton from '~/components/ui/UiSkeleton.vue'
import { formatShortDate } from '~/utils/dates'

// Capture d'idée ultra-rapide : saisie + Entrée, toast de confirmation,
// et les 3 dernières idées enregistrées juste en dessous.
const toast = useToast()

const draft = ref('')
const saving = ref(false)
const fieldError = ref<string | null>(null)

const ideas = ref<Idea[]>([])
const loading = ref(true)
const loadError = ref<string | null>(null)

const recentIdeas = computed<Idea[]>(() =>
  [...ideas.value]
    .sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    )
    .slice(0, 3),
)

function ideaDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return formatShortDate(date)
}

onMounted(() => {
  void loadIdeas()
})

watch(draft, () => {
  if (fieldError.value !== null) fieldError.value = null
})

async function loadIdeas(): Promise<void> {
  loading.value = true
  loadError.value = null
  try {
    ideas.value = await apiFetch<Idea[]>('/api/ideas')
  } catch (err) {
    ideas.value = []
    loadError.value =
      err instanceof Error && err.message
        ? err.message
        : 'Impossible de charger les idées.'
  } finally {
    loading.value = false
  }
}

async function submit(): Promise<void> {
  if (saving.value) return

  // Validation client via le schéma Zod existant (aucune doublon serveur).
  const parsed = ideaCreateSchema.safeParse({ title: draft.value })
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    fieldError.value = issue ? issue.message : 'Titre requis.'
    return
  }
  fieldError.value = null

  saving.value = true
  try {
    const created = await apiFetch<Idea>('/api/ideas', {
      method: 'POST',
      body: parsed.data,
    })
    ideas.value = [created, ...ideas.value]
    draft.value = ''
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
    saving.value = false
  }
}
</script>

<template>
  <UiCard>
    <template #header>
      <div class="flex items-center justify-between gap-3">
        <h2 class="text-base font-medium text-ink-100">Une idée ?</h2>
        <NuxtLink
          to="/idees"
          class="rounded text-xs font-medium text-accent-400 transition-colors hover:text-ink-100 focus-visible:outline-2 focus-visible:outline-accent-400"
        >
          Tout voir
        </NuxtLink>
      </div>
    </template>

    <!-- Saisie -->
    <form class="flex flex-col gap-3" @submit.prevent="submit">
      <div class="flex flex-wrap items-start gap-2">
        <div class="min-w-44 flex-1">
          <UiInput
            v-model="draft"
            label="Nouvelle idée"
            placeholder="Une idée de projet…"
            @keydown.enter.prevent="submit"
          />
        </div>
        <UiButton type="submit" :loading="saving">Noter</UiButton>
      </div>

      <p v-if="fieldError" role="alert" class="text-xs text-danger-400">
        {{ fieldError }}
      </p>
    </form>

    <!-- Dernières idées -->
    <div class="mt-5 border-t border-line pt-4">
      <div v-if="loading" class="flex flex-col gap-2" aria-busy="true">
        <UiSkeleton class="h-6 w-full" />
        <UiSkeleton class="h-6 w-5/6" />
        <UiSkeleton class="h-6 w-2/3" />
      </div>

      <div
        v-else-if="loadError"
        class="flex flex-wrap items-center justify-between gap-3"
        role="alert"
      >
        <p class="text-sm text-danger-400">{{ loadError }}</p>
        <UiButton size="sm" variant="outline" @click="loadIdeas">
          Réessayer
        </UiButton>
      </div>

      <p v-else-if="recentIdeas.length === 0" class="text-sm text-ink-500">
        Rien à noter pour l’instant.
      </p>

      <ul v-else class="flex flex-col gap-2" aria-label="Trois dernières idées">
        <li
          v-for="idea in recentIdeas"
          :key="idea.id"
          class="flex items-baseline justify-between gap-3"
        >
          <span class="min-w-0 truncate text-sm text-ink-300">
            {{ idea.title }}
          </span>
          <time
            class="shrink-0 text-xs text-ink-500"
            :datetime="idea.created_at"
          >
            {{ ideaDate(idea.created_at) }}
          </time>
        </li>
      </ul>
    </div>
  </UiCard>
</template>
