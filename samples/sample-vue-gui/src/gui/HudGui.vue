<script setup>
import { inject, onMounted, onUnmounted, ref } from "vue";

defineProps({
  title: {
    type: String,
    default: "Vue GUI Sample",
  },
  hint: {
    type: String,
    default: "Action: inventory, Escape: quest log",
  },
});

const currentPlayer = ref(null);
const rpgCurrentPlayer = inject("rpgCurrentPlayer");
let playerSub;

onMounted(() => {
  playerSub = rpgCurrentPlayer?.subscribe((player) => {
    currentPlayer.value = player?.object;
  });
});

onUnmounted(() => {
  playerSub?.unsubscribe();
});
</script>

<template>
  <section class="vue-hud">
    <div>
      <strong>{{ title }}</strong>
      <span>{{ hint }}</span>
    </div>
    <div class="player-pill">
      {{ currentPlayer?.name?.() || "Waiting for player" }}
    </div>
  </section>
</template>

<style scoped>
.vue-hud {
  position: fixed;
  top: 16px;
  left: 16px;
  right: 16px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  color: white;
  pointer-events: none;
}

.vue-hud > div {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 14px;
  border-radius: 6px;
  background: rgba(18, 25, 32, 0.82);
  box-shadow: 0 8px 18px rgba(0, 0, 0, 0.22);
}

.vue-hud span,
.player-pill {
  font-size: 13px;
  color: #d7e6ec;
}

.player-pill {
  white-space: nowrap;
}
</style>
