const DIRECTIONS = [
  { name: "E", dr: 0, dc: 1 },
  { name: "W", dr: 0, dc: -1 },
  { name: "S", dr: 1, dc: 0 },
  { name: "N", dr: -1, dc: 0 },
  { name: "SE", dr: 1, dc: 1 },
  { name: "SW", dr: 1, dc: -1 },
  { name: "NE", dr: -1, dc: 1 },
  { name: "NW", dr: -1, dc: -1 },
] as const;

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const MAX_SIZE = 36;
const ATTEMPTS_PER_SIZE = 240;

export type WordSearchPlacement = {
  display: string;
  gridWord: string;
  row: number;
  col: number;
  direction: string;
};

export type WordSearchPuzzle = {
  title: string;
  size: number;
  grid: string[][];
  words: Array<{ display: string; gridWord: string }>;
  placements: WordSearchPlacement[];
};

export function foldWordForGrid(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z]/g, "")
    .toUpperCase();
}

function mulberry32(seed: number) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function canPlace(grid: (string | null)[][], word: string, row: number, col: number, dr: number, dc: number) {
  const n = grid.length;
  for (let i = 0; i < word.length; i++) {
    const r = row + dr * i;
    const c = col + dc * i;
    if (r < 0 || c < 0 || r >= n || c >= n) return false;
    const cell = grid[r][c];
    if (cell && cell !== word[i]) return false;
  }
  return true;
}

function writeWord(grid: (string | null)[][], word: string, row: number, col: number, dr: number, dc: number) {
  for (let i = 0; i < word.length; i++) {
    grid[row + dr * i][col + dc * i] = word[i];
  }
}

function emptyGrid(size: number): (string | null)[][] {
  return Array.from({ length: size }, () => Array<string | null>(size).fill(null));
}

function tryPack(
  items: Array<{ display: string; gridWord: string }>,
  size: number,
  rand: () => number,
): WordSearchPuzzle | null {
  const grid = emptyGrid(size);
  const placements: WordSearchPlacement[] = [];

  for (const item of items) {
    let placed = false;
    for (let attempt = 0; attempt < ATTEMPTS_PER_SIZE; attempt++) {
      const dir = DIRECTIONS[Math.floor(rand() * DIRECTIONS.length)];
      const row = Math.floor(rand() * size);
      const col = Math.floor(rand() * size);
      if (!canPlace(grid, item.gridWord, row, col, dir.dr, dir.dc)) continue;
      writeWord(grid, item.gridWord, row, col, dir.dr, dir.dc);
      placements.push({
        display: item.display,
        gridWord: item.gridWord,
        row,
        col,
        direction: dir.name,
      });
      placed = true;
      break;
    }
    if (!placed) return null;
  }

  const filled = grid.map((line) =>
    line.map((cell) => cell ?? LETTERS[Math.floor(rand() * LETTERS.length)]),
  );

  return {
    title: "",
    size,
    grid: filled,
    words: items,
    placements,
  };
}

export function packWordSearch(options: {
  words: string[];
  title?: string;
  seed?: number;
  minSize?: number;
}): WordSearchPuzzle {
  const cleaned = options.words.map((w) => w.trim()).filter(Boolean);
  if (cleaned.length === 0) throw new Error("Word list is empty");

  const items = cleaned.map((display) => {
    const gridWord = foldWordForGrid(display);
    if (!gridWord) throw new Error(`"${display}" has no letters after folding`);
    return { display, gridWord };
  });
  items.sort((a, b) => b.gridWord.length - a.gridWord.length);

  const longest = items[0].gridWord.length;
  let size = Math.max(options.minSize ?? 10, longest + 2);
  const seed = options.seed ?? 20260919;

  while (size <= MAX_SIZE) {
    const packed = tryPack(items, size, mulberry32(seed + size * 17));
    if (packed) {
      packed.title = options.title ?? "Word search";
      return packed;
    }
    size += 2;
  }

  throw new Error(`Could not place all ${items.length} words even on a ${MAX_SIZE}×${MAX_SIZE} grid`);
}

function wordAppears(grid: string[][], word: string): boolean {
  const n = grid.length;
  for (const dir of DIRECTIONS) {
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (!canPlace(grid, word, r, c, dir.dr, dir.dc)) continue;
        let ok = true;
        for (let i = 0; i < word.length; i++) {
          if (grid[r + dir.dr * i][c + dir.dc * i] !== word[i]) {
            ok = false;
            break;
          }
        }
        if (ok) return true;
      }
    }
  }
  return false;
}

export function everyWordAppears(puzzle: WordSearchPuzzle): boolean {
  return puzzle.words.every((w) => wordAppears(puzzle.grid, w.gridWord));
}

export function formatWordSearchStudent(puzzle: WordSearchPuzzle): string {
  const header = puzzle.title ? `${puzzle.title}\n\n` : "";
  const grid = puzzle.grid.map((row) => row.join(" ")).join("\n");
  const words = puzzle.words.map((w) => `• ${w.display}`).join("\n");
  return `${header}${grid}\n\nWords\n${words}\n`;
}

export function formatWordSearchKey(puzzle: WordSearchPuzzle): string {
  const lines = puzzle.placements.map(
    (p) => `${p.display} → row ${p.row + 1}, col ${p.col + 1}, ${p.direction} (${p.gridWord})`,
  );
  return `Answer key\n${lines.join("\n")}\n`;
}

export function formatWordSearchFull(puzzle: WordSearchPuzzle): string {
  return `${formatWordSearchStudent(puzzle)}\n---\n${formatWordSearchKey(puzzle)}`;
}
