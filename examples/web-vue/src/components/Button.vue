<!--
  FortressAuth - Button Component (Vue)
  Accessible button with loading states and variants.
-->
<script setup lang="ts">
import { computed } from 'vue';
import type { ButtonProps } from './types';

const props = withDefaults(defineProps<ButtonProps>(), {
  variant: 'primary',
  size: 'md',
  loading: false,
  loadingText: 'Loading...',
  fullWidth: true,
  disabled: false,
  type: 'button',
});

// biome-ignore lint/correctness/noUnusedVariables: Variable is used in Vue template section
const isDisabled = computed(() => props.disabled || props.loading);
</script>

<template>
  <button
    :type="type"
    :class="[
      'btn',
      `btn-${variant}`,
      `btn-${size}`,
      { 'btn-full': fullWidth }
    ]"
    :disabled="isDisabled"
    :aria-busy="loading"
    :aria-disabled="isDisabled"
  >
    <template v-if="loading">
      <span class="btn-spinner" aria-hidden="true" />
      <span>{{ loadingText }}</span>
    </template>
    <template v-else>
      <slot />
    </template>
  </button>
</template>
