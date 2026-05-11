<script setup>
import { defineProps } from 'vue';

defineOptions({
  name: "vue-tooltip",
  rpgAttachToSprite: true
})

const props = defineProps({
  object: {
    type: Object
  },
  spriteData: {
    type: Object
  }
})
</script>

<template>
  <div class="vue-tooltip">
    {{ object?.name || spriteData?.object?.name || 'Tooltip' }}
  </div>
</template>

<style scoped>
.vue-tooltip {
  transform: translate(-50%, -100%);
  padding: 4px 8px;
  border-radius: 4px;
  background: rgba(20, 20, 24, 0.86);
  color: white;
  font-size: 12px;
  white-space: nowrap;
}
</style>
