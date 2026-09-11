<script setup lang="ts">
import {
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from "reka-ui";

const props = withDefaults(
  defineProps<{
    title: string;
    description?: string;
    size?: "default" | "wide";
  }>(),
  { description: undefined, size: "default" },
);

const accessibleDescription = computed(
  () => props.description ?? `Диалоговое окно «${props.title}»`,
);

const emit = defineEmits<{
  close: [];
}>();

const isAttentionAnimating = ref(false);

const handleOpenChange = (open: boolean): void => {
  if (!open) emit("close");
};

const handlePointerDownOutside = async (event: Event): Promise<void> => {
  event.preventDefault();
  isAttentionAnimating.value = false;
  await nextTick();
  isAttentionAnimating.value = true;
};
</script>

<template>
  <DialogRoot :open="true" @update:open="handleOpenChange">
    <DialogPortal>
      <DialogOverlay class="modal__overlay" />
      <DialogContent
        class="modal__panel"
        :class="{
          'modal__panel--wide': size === 'wide',
          'modal__panel--attention': isAttentionAnimating,
        }"
        @pointer-down-outside="handlePointerDownOutside"
        @interact-outside.prevent
        @animationend="isAttentionAnimating = false"
      >
        <header class="modal__header">
          <DialogTitle class="section-title">{{ title }}</DialogTitle>
          <DialogDescription class="visually-hidden">
            {{ accessibleDescription }}
          </DialogDescription>
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
