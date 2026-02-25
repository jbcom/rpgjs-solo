import { ExecutionPlayer } from "./types";

const PLAYER_VARIABLES: Record<
  string,
  (player: any) => string | number | null | undefined
> = {
  level: (player) => player.level,
  hp: (player) => player.hp,
};

export const resolveVariablesInText = (text: string, player: ExecutionPlayer) => {
  return text.replace(/{(\w+)}/g, (match, p1: string) => {
    const resolver = PLAYER_VARIABLES[p1];
    if (!resolver) {
      return match;
    }
    const value = resolver(player);
    return value == null ? match : String(value);
  });
};
