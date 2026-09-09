<script setup lang="ts">
import { ToastClose, ToastDescription, ToastProvider, ToastRoot, ToastViewport } from "reka-ui";

const toast = useToast();
</script>

<template>
  <ToastProvider label="Уведомления" swipe-direction="right">
    <ToastRoot
      v-for="notification in toast.notifications.value"
      :key="notification.id"
      class="toast"
      :class="`toast--${notification.type}`"
      :duration="notification.type === 'error' ? 7000 : 5000"
      :open="true"
      :type="notification.type === 'error' ? 'foreground' : 'background'"
      @update:open="(open) => !open && toast.dismiss(notification.id)"
    >
      <ToastDescription class="toast__message">
        {{ notification.text }}
      </ToastDescription>
      <ToastClose as-child>
        <button
          class="icon-button icon-button--compact icon-button--ghost toast__close"
          type="button"
          aria-label="Закрыть уведомление"
        >
          <UiIcon name="close" />
        </button>
      </ToastClose>
    </ToastRoot>

    <ToastViewport class="toast-viewport" />
  </ToastProvider>
</template>
