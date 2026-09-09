<script setup lang="ts">
const { theme, toggleTheme } = useTheme();
</script>

<template>
  <button
    class="icon-button icon-button--compact icon-button--ghost"
    type="button"
    :aria-label="theme === 'dark' ? 'Включить светлую тему' : 'Включить тёмную тему'"
    :title="theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'"
    @click="toggleTheme"
  >
    <UiIcon :name="theme === 'dark' ? 'sun' : 'moon'" />
  </button>
</template>
