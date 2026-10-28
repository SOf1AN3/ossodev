<script setup lang="ts">
interface UiTextareaProps {
  modelValue?: string
  placeholder?: string
  label?: string
  rows?: number
}

withDefaults(defineProps<UiTextareaProps>(), {
  modelValue: '',
  placeholder: '',
  label: undefined,
  rows: 4,
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const textareaId = useId()

function onInput(event: Event): void {
  const target = event.target as HTMLTextAreaElement
  emit('update:modelValue', target.value)
}
</script>

<template>
  <div class="w-full">
    <label
      v-if="label"
      :for="textareaId"
      class="mb-1.5 block text-sm text-ink-300"
    >
      {{ label }}
    </label>
    <textarea
      :id="textareaId"
      :value="modelValue"
      :placeholder="placeholder"
      :rows="rows"
      class="w-full resize-y rounded-lg border border-line bg-surface-800 px-3 py-2 text-ink-100 placeholder:text-ink-500"
      @input="onInput"
    />
  </div>
</template>
