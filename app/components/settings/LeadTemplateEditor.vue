<script setup lang="ts">
import UiBadge from '~/components/ui/UiBadge.vue'
import UiButton from '~/components/ui/UiButton.vue'
import UiTextarea from '~/components/ui/UiTextarea.vue'

interface LeadTemplateEditorProps {
  modelValue: string
  saving?: boolean
}

const props = withDefaults(defineProps<LeadTemplateEditorProps>(), {
  saving: false,
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
  save: []
}>()

const TACHES_PLACEHOLDER = '{{TACHES}}'

const PLACEHOLDERS: string[] = [
  TACHES_PLACEHOLDER,
  '{{PROJET}}',
  '{{DOSSIER}}',
]

const textareaWrapRef = ref<HTMLDivElement | null>(null)

/** Insère un placeholder à la position du curseur dans le textarea. */
function insertPlaceholder(placeholder: string): void {
  const area = textareaWrapRef.value?.querySelector('textarea')
  const current = props.modelValue
  if (!area) {
    emit('update:modelValue', `${current}${placeholder}`)
    return
  }
  const start = area.selectionStart ?? current.length
  const end = area.selectionEnd ?? start
  emit(
    'update:modelValue',
    `${current.slice(0, start)}${placeholder}${current.slice(end)}`,
  )
  nextTick(() => {
    area.focus()
    const position = start + placeholder.length
    area.setSelectionRange(position, position)
  })
}
</script>

<template>
  <section class="surface px-5 py-4">
    <h2 class="text-base font-medium text-ink-100">
      Modèle d’introduction LEAD
    </h2>
    <p class="mt-1 text-sm text-ink-300">
      La liste des tâches du projet sera injectée à l’emplacement de
      <span class="font-mono text-[12px] text-ink-700">
        {{ TACHES_PLACEHOLDER }}
      </span>.
      Si tu retires ce marqueur, la liste sera ajoutée en fin de message.
    </p>

    <div ref="textareaWrapRef" class="mt-4">
      <UiTextarea
        :model-value="modelValue"
        label="Introduction du prompt"
        :rows="10"
        placeholder="Tu es LEAD, un assistant de développement…"
        class="[&_textarea]:min-h-72 [&_textarea]:font-mono [&_textarea]:text-[13px]"
        @update:model-value="emit('update:modelValue', $event)"
      />
    </div>

    <div class="mt-3 flex flex-wrap items-center gap-2">
      <span class="micro text-ink-500">Placeholders disponibles</span>
      <button
        v-for="placeholder in PLACEHOLDERS"
        :key="placeholder"
        type="button"
        class="rounded-full transition-opacity hover:opacity-80"
        :aria-label="`Insérer le placeholder ${placeholder} à la position du curseur`"
        @click="insertPlaceholder(placeholder)"
      >
        <UiBadge tone="accent">{{ placeholder }}</UiBadge>
      </button>
    </div>

    <div class="mt-4 flex justify-end">
      <UiButton :loading="saving" @click="emit('save')">
        Enregistrer
      </UiButton>
    </div>
  </section>
</template>
