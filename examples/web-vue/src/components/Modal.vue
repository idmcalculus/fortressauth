<!--
  FortressAuth - Modal Component (Vue)
  Accessible modal dialog with focus management.
-->
<script setup lang="ts">
import { nextTick, onUnmounted, ref, watch } from 'vue';
import type { ModalProps } from './types';

const props = defineProps<ModalProps>();

const emit = defineEmits<{
  close: [];
}>();

const modalRef = ref<HTMLDivElement | null>(null);
let previousActiveElement: HTMLElement | null = null;

// Handle escape key
function handleEscape(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    emit('close');
  }
}

// Handle click outside modal
// biome-ignore lint/correctness/noUnusedVariables: Function is used in Vue template section
function handleOverlayClick(e: MouseEvent) {
  if (e.target === e.currentTarget) {
    emit('close');
  }
}

// Trap focus within modal
// biome-ignore lint/correctness/noUnusedVariables: Function is used in Vue template section
function handleKeyDown(e: KeyboardEvent) {
  if (e.key !== 'Tab') return;

  const focusableElements = modalRef.value?.querySelectorAll<HTMLElement>(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
  );

  if (!focusableElements || focusableElements.length === 0) return;

  const firstElement = focusableElements[0];
  const lastElement = focusableElements[focusableElements.length - 1];

  if (!firstElement || !lastElement) return;

  if (e.shiftKey && document.activeElement === firstElement) {
    e.preventDefault();
    lastElement.focus();
  } else if (!e.shiftKey && document.activeElement === lastElement) {
    e.preventDefault();
    firstElement.focus();
  }
}

watch(
  () => props.isOpen,
  async (isOpen) => {
    if (isOpen) {
      // Store the currently focused element
      previousActiveElement = document.activeElement as HTMLElement;

      // Prevent body scroll
      document.body.style.overflow = 'hidden';

      // Add escape key listener
      document.addEventListener('keydown', handleEscape);

      // Focus the modal after it's rendered
      await nextTick();
      modalRef.value?.focus();
    } else {
      // Remove escape key listener
      document.removeEventListener('keydown', handleEscape);

      // Restore body scroll
      document.body.style.overflow = '';

      // Restore focus to the previously focused element
      previousActiveElement?.focus();
    }
  },
);

onUnmounted(() => {
  document.removeEventListener('keydown', handleEscape);
  document.body.style.overflow = '';
});
</script>

<template>
  <Teleport to="body">
    <div
      v-if="isOpen"
      class="modal-overlay"
      role="presentation"
      @click="handleOverlayClick"
    >
      <div
        ref="modalRef"
        class="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        :aria-describedby="description ? 'modal-description' : undefined"
        tabindex="-1"
        @keydown="handleKeyDown"
      >
        <div class="modal-header">
          <h2 id="modal-title" class="modal-title">
            {{ title }}
          </h2>
          <button
            type="button"
            class="modal-close"
            aria-label="Close dialog"
            @click="emit('close')"
          >
            ×
          </button>
        </div>
        
        <p v-if="description" id="modal-description" class="modal-description">
          {{ description }}
        </p>
        
        <div class="modal-content">
          <slot />
        </div>
      </div>
    </div>
  </Teleport>
</template>
