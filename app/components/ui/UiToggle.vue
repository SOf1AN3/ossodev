<script setup lang="ts">
interface UiToggleProps {
  modelValue: boolean
  label?: string
}

const props = defineProps<UiToggleProps>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()

const toggleId = useId()

function toggle(): void {
  emit('update:modelValue', !props.modelValue)
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === ' ' || event.key === 'Enter') {
    event.preventDefault()
    toggle()
  }
}
</script>

<template>
  <div class="flex items-center gap-3">
    <button
      :id="toggleId"
      type="button"
      role="switch"
      :aria-checked="modelValue"
      :aria-label="label"
      class="relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border transition-colors duration-200 ease-[var(--ease-out-expo)]"
      :class="modelValue ? 'border-accent-fill bg-accent-fill' : 'border-line bg-surface-600'"
      @click="toggle"
      @keydown="onKeydown"
    >
      <span
        class="inline-block h-4 w-4 rounded-full bg-ink-100 transition-transform duration-200 ease-[var(--ease-out-expo)]"
        :class="modelValue ? 'translate-x-[22px]' : 'translate-x-1'"
        aria-hidden="true"
      />
    </button>
    <label
      v-if="label"
      :for="toggleId"
      class="select-none text-sm text-ink-300"
    >
      {{ label }}
    </label>
  </div>
</template>
