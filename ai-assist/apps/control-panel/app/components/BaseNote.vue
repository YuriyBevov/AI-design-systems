<script setup lang="ts">
defineProps<{
  items: readonly string[];
}>();
</script>

<template>
  <ul class="note">
    <li v-for="item in items" :key="item" class="note__item">
      <span class="note__marker" aria-hidden="true">*</span>
      <span>{{ item }}</span>
    </li>
  </ul>
</template>
