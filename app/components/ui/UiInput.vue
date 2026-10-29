<script setup lang="ts">
interface UiInputProps {
  modelValue?: string
  placeholder?: string
  label?: string
  type?: string
}

withDefaults(defineProps<UiInputProps>(), {
  modelValue: '',
  placeholder: '',
  label: undefined,
  type: 'text',
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
  enter: [event: KeyboardEvent]
}>()

const inputId = useId()

function onInput(event: Event): void {
  const target = event.target
  if (target instanceof HTMLInputElement) {
    emit('update:modelValue', target.value)
  }
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Enter') {
    emit('enter', event)
  }
}
</script>

<template>
  <div class="field w-full">
    <label
      v-if="label"
      :for="inputId"
      class="micro mb-1.5 block text-ink-500"
    >
      {{ label }}
    </label>
    <input
      :id="inputId"
      :type="type"
      :value="modelValue"
      :placeholder="placeholder"
      class="w-full rounded-sm border border-line bg-surface-800 px-3 py-2 text-sm text-ink-100 placeholder:text-ink-700"
      @input="onInput"
      @keydown="onKeydown"
    >
  </div>
</template>
