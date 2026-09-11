<script setup lang="ts">
useActiveProject();
await navigateTo("/", { redirectCode: 302, replace: true });
</script>
