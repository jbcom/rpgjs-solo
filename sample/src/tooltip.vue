<script setup>
import { defineProps } from 'vue';

defineOptions({
  name: "my-tooltip"
})

const props = defineProps({
  object: {
    type: Object
  }
})
</script>

<template>
  <div>Tooltip</div>
</template>