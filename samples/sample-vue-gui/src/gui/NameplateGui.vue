<script setup>
defineOptions({
  name: "vue-nameplate",
  rpgAttachToSprite: true,
});

defineProps({
  object: Object,
  spriteData: Object,
});

function readName(object) {
  const name = object?.name;
  return typeof name === "function" ? name() : name;
}
</script>

<template>
  <div class="nameplate">
    {{ readName(object) || readName(spriteData?.object) || "Player" }}
  </div>
</template>

<style scoped>
.nameplate {
  transform: translate(-50%, -120%);
  padding: 5px 9px;
  border-radius: 6px;
  color: #10202a;
  background: #f0d36e;
  box-shadow: 0 8px 18px rgba(0, 0, 0, 0.26);
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
}
</style>
