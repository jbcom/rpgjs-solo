<script setup>
import { inject } from "vue";

defineProps({
  items: {
    type: Array,
    default: () => [],
  },
  message: {
    type: String,
    default: "",
  },
});

const rpgGuiClose = inject("rpgGuiClose");
const rpgGuiInteraction = inject("rpgGuiInteraction");

function useItem(item) {
  rpgGuiInteraction("vue-inventory", "use-item", {
    itemId: item.id,
  });
}
</script>

<template>
  <section class="inventory" v-propagate>
    <header>
      <div>
        <h2>Inventory</h2>
        <p>{{ message }}</p>
      </div>
      <button type="button" @click="rpgGuiClose('vue-inventory')">Close</button>
    </header>

    <div class="items">
      <button v-for="item in items" :key="item.id" type="button" @click="useItem(item)">
        <strong>{{ item.name }}</strong>
        <span>{{ item.description }}</span>
        <em>x{{ item.quantity }}</em>
      </button>
    </div>
  </section>
</template>

<style scoped>
.inventory {
  position: fixed;
  top: 50%;
  left: 50%;
  width: min(520px, calc(100vw - 32px));
  transform: translate(-50%, -50%);
  padding: 18px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 8px;
  background: rgba(16, 23, 31, 0.94);
  color: white;
  box-shadow: 0 18px 44px rgba(0, 0, 0, 0.36);
}

header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 14px;
}

h2,
p {
  margin: 0;
}

p {
  margin-top: 4px;
  color: #c6d6dc;
  font-size: 13px;
}

button {
  border: 0;
  border-radius: 6px;
  cursor: pointer;
}

header button {
  padding: 8px 12px;
  color: #10202a;
  background: #9bd8e7;
}

.items {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 10px;
}

.items button {
  position: relative;
  min-height: 104px;
  padding: 12px;
  text-align: left;
  color: white;
  background: #26384a;
}

.items button:hover {
  background: #31516a;
}

.items span {
  display: block;
  margin-top: 8px;
  color: #c6d6dc;
  font-size: 12px;
}

.items em {
  position: absolute;
  right: 10px;
  bottom: 10px;
  font-style: normal;
  color: #9bd8e7;
}
</style>
