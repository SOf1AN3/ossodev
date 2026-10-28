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
      class="relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border border-line transition-colors focus-visible:outline-2 focus-visible:outline-accent-400"
      :class="modelValue ? 'bg-accent-400' : 'bg-surface-800'"
      @click="toggle"
      @keydown="onKeydown"
    >
      <span
        class="inline-block h-4 w-4 transform rounded-full bg-ink-100 transition-transform"
        :class="modelValue ? 'translate-x-6' : 'translate-x-1'"
        aria-hidden="true"
      />
    </button>
    <label
      v-if="label"
      :for="toggleId"
      class="text-sm text-ink-300 select-none"
    >
      {{ label }}
    </label>
  </div>
</template>
