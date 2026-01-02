<!--
  FortressAuth - Alert Component (Vue)
  Displays feedback messages to users with appropriate styling.
-->
<script setup lang="ts">
import type { AlertProps, AlertType } from './types';

withDefaults(defineProps<AlertProps>(), {
  dismissible: true,
});

// biome-ignore lint/correctness/noUnusedVariables: Variable is used in Vue template section
const emit = defineEmits<{
  dismiss: [];
}>();

// biome-ignore lint/correctness/noUnusedVariables: Variable is used in Vue template section
const alertIcons: Record<AlertType, string> = {
  success: '✓',
  error: '✕',
  warning: '⚠',
  info: 'ℹ',
};

// biome-ignore lint/correctness/noUnusedVariables: Variable is used in Vue template section
const alertLabels: Record<AlertType, string> = {
  success: 'Success',
  error: 'Error',
  warning: 'Warning',
  info: 'Information',
};
</script>

<template>
  <div
    :class="['alert', `alert-${type}`]"
    role="alert"
    aria-live="polite"
    aria-atomic="true"
  >
    <span class="alert-icon" aria-hidden="true">
      {{ alertIcons[type] }}
    </span>
    <span class="sr-only">{{ alertLabels[type] }}:</span>
    <span class="alert-message">{{ message }}</span>
    <button
      v-if="dismissible"
      type="button"
      class="alert-dismiss"
      aria-label="Dismiss alert"
      @click="emit('dismiss')"
    >
      ×
    </button>
  </div>
</template>
