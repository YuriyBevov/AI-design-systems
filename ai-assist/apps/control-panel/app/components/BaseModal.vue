<script setup lang="ts">
import {
  DialogClose,
  DialogContent,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from "reka-ui";

withDefaults(
  defineProps<{
    title: string;
    size?: "default" | "wide";
  }>(),
  { size: "default" },
);

const emit = defineEmits<{
  close: [];
}>();

const handleOpenChange = (open: boolean): void => {
  if (!open) emit("close");
};
</script>

<template>
  <DialogRoot :open="true" @update:open="handleOpenChange">
    <DialogPortal>
      <DialogOverlay class="modal__overlay" />
      <DialogContent class="modal__panel" :class="{ 'modal__panel--wide': size === 'wide' }">
        <header class="modal__header">
          <DialogTitle class="section-title">{{ title }}</DialogTitle>
          <div class="modal__header-actions">
            <slot name="header-actions" />
            <DialogClose as-child>
              <button
                class="icon-button icon-button--compact icon-button--ghost"
                type="button"
                aria-label="Закрыть"
              >
                <UiIcon name="close" />
              </button>
            </DialogClose>
          </div>
        </header>

        <div class="modal__body">
          <slot />
        </div>

        <footer v-if="$slots.footer" class="modal__footer">
          <slot name="footer" />
        </footer>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
