<!--
  FortressAuth - Input Component (Vue)
  Accessible form input with validation states and error messages.
-->
<script setup lang="ts">
import { computed, useId } from 'vue';
import type { InputProps } from './types';

const props = withDefaults(defineProps<InputProps>(), {
  type: 'text',
  placeholder: '',
  required: false,
  disabled: false,
  autoComplete: 'off',
});

const emit = defineEmits<{
  'update:modelValue': [value: string];
}>();

const id = useId();
const errorId = computed(() => `${id}-error`);
const hintId = computed(() => `${id}-hint`);

const hasError = computed(() => Boolean(props.error));

// biome-ignore lint/correctness/noUnusedVariables: Variable is used in Vue template section
const describedBy = computed(() => {
  const ids: string[] = [];
  if (hasError.value) ids.push(errorId.value);
  else if (props.hint) ids.push(hintId.value);
  return ids.length > 0 ? ids.join(' ') : undefined;
});

// biome-ignore lint/correctness/noUnusedVariables: Function is used in Vue template section
function handleInput(event: Event) {
  const target = event.target as HTMLInputElement;
  emit('update:modelValue', target.value);
}
</script>

<template>
  <div :class="['form-group', { 'has-error': hasError }]">
    <label :for="id" class="form-label">
      {{ label }}
      <span v-if="required" class="form-required" aria-hidden="true"> *</span>
    </label>
    
    <input
      :id="id"
      :type="type"
      :value="modelValue"
      :class="['form-input', { 'input-error': hasError }]"
      :placeholder="placeholder"
      :required="required"
      :disabled="disabled"
      :autocomplete="autoComplete"
      :aria-invalid="hasError"
      :aria-describedby="describedBy"
      :aria-required="required"
      @input="handleInput"
    />
    
    <p v-if="hint && !hasError" :id="hintId" class="form-hint">
      {{ hint }}
    </p>
    
    <p v-if="hasError" :id="errorId" class="form-error" role="alert">
      {{ error }}
    </p>
  </div>
</template>
