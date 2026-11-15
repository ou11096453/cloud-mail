<template>
  <button type="button" class="icon-button hamburger-button" :aria-label="$t('navigation')" :title="$t('navigation')" :aria-expanded="isActive" @click="toggleClick">
    <Icon icon="material-symbols:menu-rounded" width="22" height="22" />
  </button>
</template>

<script setup>
import { Icon } from '@iconify/vue'
defineProps({
  isActive: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['click'])
const toggleClick = () => {
  emit('click');
}
</script>

<style scoped>
.hamburger-button {
  margin: 0 8px;
}
</style>
