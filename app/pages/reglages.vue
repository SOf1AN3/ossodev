<script setup lang="ts">
import { useSettings } from '~/composables/useSettings'
import { useToast } from '~/composables/useToast'
import SettingsCommandEditor from '~/components/settings/CommandEditor.vue'
import SettingsLeadTemplateEditor from '~/components/settings/LeadTemplateEditor.vue'
import UiButton from '~/components/ui/UiButton.vue'
import UiEmptyState from '~/components/ui/UiEmptyState.vue'
import UiSkeleton from '~/components/ui/UiSkeleton.vue'

useHead({ title: 'Réglages — OSSO' })

const { settings, pending, saving, error, load, save } = useSettings()
const toast = useToast()

onMounted(() => {
  void load()
})

async function onSave(): Promise<void> {
  try {
    await save({ ...settings.value })
    toast.show({
      tone: 'success',
      title: 'Réglages enregistrés',
      message: 'Ton modèle LEAD et tes commandes sont à jour.',
    })
  } catch (err) {
    toast.show({
      tone: 'error',
      title: 'Enregistrement impossible',
      message: err instanceof Error ? err.message : 'Erreur inconnue.',
    })
  }
}
</script>

<template>
  <div class="page-enter flex flex-col gap-6">
    <header>
      <h1 class="text-2xl font-semibold text-ink-100">Réglages</h1>
      <p class="mt-1 text-sm text-ink-300">
        Configure le prompt LEAD et les commandes du pont local.
      </p>
    </header>

    <!-- Bandeau d'information : portée locale des réglages -->
    <div class="surface flex flex-col gap-1 px-4 py-3" role="note">
      <p class="micro text-ink-500">Portée locale</p>
      <p class="text-sm text-ink-300">
        Ces réglages ne s’appliquent qu’en local. Sur Vercel, les fonctions
        d’exécution sont désactivées.
      </p>
    </div>

    <!-- Chargement -->
    <div
      v-if="pending"
      class="flex flex-col gap-4"
      aria-busy="true"
      aria-label="Chargement des réglages"
    >
      <UiSkeleton class="h-72 w-full" />
      <UiSkeleton class="h-48 w-full" />
    </div>

    <!-- Erreur -->
    <UiEmptyState
      v-else-if="error"
      title="Impossible de charger les réglages"
      :description="error"
    >
      <template #action>
        <UiButton @click="load">Réessayer</UiButton>
      </template>
    </UiEmptyState>

    <template v-else>
      <SettingsLeadTemplateEditor
        v-model="settings.leadIntroTemplate"
        :saving="saving"
        @save="onSave"
      />

      <SettingsCommandEditor
        :brain-command="settings.brainCommand"
        :terminal-command="settings.terminalCommand"
        :saving="saving"
        @update:brain-command="settings.brainCommand = $event"
        @update:terminal-command="settings.terminalCommand = $event"
        @save="onSave"
      />
    </template>
  </div>
</template>
