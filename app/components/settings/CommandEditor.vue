<script setup lang="ts">
import UiButton from '~/components/ui/UiButton.vue'
import UiInput from '~/components/ui/UiInput.vue'

interface CommandEditorProps {
  brainCommand: string
  terminalCommand: string
  saving?: boolean
}

defineProps<CommandEditorProps>()

const emit = defineEmits<{
  'update:brainCommand': [value: string]
  'update:terminalCommand': [value: string]
  save: []
}>()

const DOSSIER_PLACEHOLDER = '{{DOSSIER}}'
const WINDOWS_EXAMPLE =
  'powershell -NoExit -Command "Set-Location \'{{DOSSIER}}\'"'
</script>

<template>
  <section class="surface px-5 py-4">
    <h2 class="text-base font-medium text-ink-100">Commandes du pont</h2>

    <div class="mt-4 flex flex-col gap-5">
      <div>
        <UiInput
          :model-value="brainCommand"
          label="Commande cerveau (brain)"
          placeholder="npm run brain:scan"
          class="[&_input]:font-mono [&_input]:text-[13px]"
          @update:model-value="emit('update:brainCommand', $event)"
        />
        <p class="mt-1.5 text-xs text-ink-500">
          Commande lancée par le pont pour déclencher le scan du dossier dev.
          Si tu la laisses vide, OSSO affichera simplement la commande à copier
          plutôt que de l’exécuter.
        </p>
      </div>

      <div>
        <UiInput
          :model-value="terminalCommand"
          label="Commande terminal"
          :placeholder="WINDOWS_EXAMPLE"
          class="[&_input]:font-mono [&_input]:text-[13px]"
          @update:model-value="emit('update:terminalCommand', $event)"
        />
        <p class="mt-1.5 text-xs text-ink-500">
          Commande ouverte dans un terminal, depuis le dossier du projet. Le
          placeholder
          <span class="font-mono text-[12px] text-ink-700">
            {{ DOSSIER_PLACEHOLDER }}
          </span>
          est remplacé par le chemin absolu du projet. Exemple Windows par
          défaut :
        </p>
        <p class="mt-1 font-mono text-[12px] text-ink-700">
          {{ WINDOWS_EXAMPLE }}
        </p>
      </div>
    </div>

    <div class="mt-4 flex justify-end">
      <UiButton :loading="saving" @click="emit('save')">
        Enregistrer
      </UiButton>
    </div>
  </section>
</template>
