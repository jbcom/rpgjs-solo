<script setup>
import { inject } from "vue";

defineProps({
  quests: {
    type: Array,
    default: () => [],
  },
});

const rpgGuiClose = inject("rpgGuiClose");
</script>

<template>
  <aside class="quest-log" v-propagate>
    <header>
      <h2>Quest Log</h2>
      <button type="button" @click="rpgGuiClose('vue-quest-log')">Close</button>
    </header>
    <ul>
      <li v-for="quest in quests" :key="quest.id" :class="{ done: quest.done }">
        <span>{{ quest.done ? "Done" : "Open" }}</span>
        {{ quest.label }}
      </li>
    </ul>
  </aside>
</template>

<style scoped>
.quest-log {
  position: fixed;
  right: 16px;
  top: 78px;
  width: min(360px, calc(100vw - 32px));
  padding: 16px;
  border-radius: 8px;
  color: white;
  background: rgba(20, 29, 40, 0.92);
  box-shadow: 0 16px 38px rgba(0, 0, 0, 0.32);
}

header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

h2 {
  margin: 0;
  font-size: 18px;
}

button {
  border: 0;
  border-radius: 6px;
  padding: 8px 12px;
  color: #10202a;
  background: #9bd8e7;
  cursor: pointer;
}

ul {
  display: grid;
  gap: 10px;
  padding: 0;
  margin: 16px 0 0;
  list-style: none;
}

li {
  padding: 10px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.08);
}

li.done {
  color: #bdeccd;
}

span {
  display: inline-block;
  margin-right: 8px;
  color: #9bd8e7;
  font-size: 12px;
  text-transform: uppercase;
}
</style>
