import { games } from "./generated-games";
import "./styles.css";

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("Missing #app element");
}

app.innerHTML = `
  <main class="playground">
    <aside class="sidebar" aria-label="Gameplay demos">
      <header class="brand">
        <p class="eyebrow">RPGJS Playground</p>
        <h1>Gameplay</h1>
      </header>
      <nav class="game-list">
        ${games
          .map(
            (game, index) => `
              <button class="game-nav ${index === 0 ? "is-active" : ""}" type="button" data-game-id="${game.id}">
                <span>${game.title}</span>
                <small>${game.tags.join(" / ")}</small>
              </button>
            `,
          )
          .join("")}
      </nav>
    </aside>

    <section class="viewer">
      <header class="topbar">
      <div>
        <p class="eyebrow" id="selected-modes"></p>
        <h2 id="selected-title"></h2>
        <p id="selected-description"></p>
      </div>
      <a id="open-game" class="open-link" target="_blank" rel="noreferrer">Open</a>
      </header>
      <iframe id="game-frame" title="RPGJS gameplay preview"></iframe>
    </section>
  </main>
`;

const frame = document.querySelector<HTMLIFrameElement>("#game-frame");
const title = document.querySelector<HTMLHeadingElement>("#selected-title");
const modes = document.querySelector<HTMLParagraphElement>("#selected-modes");
const description = document.querySelector<HTMLParagraphElement>(
  "#selected-description",
);
const openGame = document.querySelector<HTMLAnchorElement>("#open-game");
const buttons =
  document.querySelectorAll<HTMLButtonElement>("[data-game-id]");

function selectGame(gameId: string) {
  const game = games.find((entry) => entry.id === gameId) ?? games[0];

  if (!game || !frame || !title || !modes || !description || !openGame) {
    return;
  }

  frame.src = game.devUrl;
  title.textContent = game.title;
  modes.textContent = game.modes.join(" / ");
  description.textContent = game.description;
  openGame.href = game.devUrl;

  for (const button of buttons) {
    button.classList.toggle("is-active", button.dataset.gameId === game.id);
  }

  const url = new URL(window.location.href);
  url.searchParams.set("game", game.id);
  window.history.replaceState(null, "", url);
}

for (const button of buttons) {
  button.addEventListener("click", () => {
    if (button.dataset.gameId) {
      selectGame(button.dataset.gameId);
    }
  });
}

const initialGameId = new URL(window.location.href).searchParams.get("game");
selectGame(initialGameId ?? games[0]?.id ?? "");
