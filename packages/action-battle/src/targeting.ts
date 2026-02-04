import { ActionBattleAoeMask } from "./types";

export interface ParsedAoeMask {
  width: number;
  height: number;
  centerX: number;
  centerY: number;
  cells: Array<{ dx: number; dy: number }>;
}

const normalizeMaskRows = (mask: ActionBattleAoeMask | undefined): string[] => {
  if (!mask) return ["#"];
  if (Array.isArray(mask)) return mask;
  return mask
    .trim()
    .split("\n")
    .map((row) => row.replace(/\r/g, ""));
};

export const parseAoeMask = (mask: ActionBattleAoeMask | undefined): ParsedAoeMask => {
  const rows = normalizeMaskRows(mask);
  const height = rows.length;
  const width = rows.reduce((max, row) => Math.max(max, row.length), 0);
  const centerX = Math.floor(width / 2);
  const centerY = Math.floor(height / 2);
  const cells: Array<{ dx: number; dy: number }> = [];

  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const char = row[x];
      if (char && char !== "." && char !== " ") {
        cells.push({ dx: x - centerX, dy: y - centerY });
      }
    }
  });

  if (cells.length === 0) {
    cells.push({ dx: 0, dy: 0 });
  }

  return { width, height, centerX, centerY, cells };
};

export const manhattanDistance = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
