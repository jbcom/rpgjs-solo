import { writeGeneratedGames } from "./playground-config.mjs";

const games = await writeGeneratedGames();

console.log(`Generated ${games.length} playground game entries.`);
