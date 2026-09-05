// Bingo live - data contract shared with the backend (mocked for the demo).
// Keep these shapes in sync with qori-api when the real wiring lands.

export type BingoLetter = "B" | "I" | "N" | "G" | "O";

export type BingoCard = {
  B: number[];
  I: number[];
  N: (number | null)[]; // center (index 2) is null = FREE
  G: number[];
  O: number[];
};

export type Ball = { letter: BingoLetter; number: number };

export type Participant = {
  userId: string;
  nickname: string;
  avatarUrl: string | null;
  suertudo: boolean;
  bestLetters: BingoLetter[]; // columns fully marked on their best card
  marks: number; // marked cells on their best card
  cards: number; // how many tarjetas this player holds
};

export type ChatMsg = {
  id: string;
  nickname: string;
  avatarUrl: string | null;
  suertudo: boolean;
  text: string;
  at: string;
};

export type BingoState = {
  status: "waiting" | "drawing" | "finished";
  drawnBalls: number[]; // in call order
  currentBall: Ball | null; // being revealed
  nextBallInSec: number; // 0..18 countdown
  viewers: number; // people watching live (>= players; spectators included)
  prize: { title: string; description: string; valueUsd: number; imageUrl: string };
  fairness: {
    commitment: string;
    serverSeed?: string;
    drandRound?: string;
    drandValue?: string;
    digest?: string;
  };
  me: {
    userId: string;
    nickname: string;
    avatarUrl: string | null;
    suertudo: boolean;
    cards: BingoCard[];
    activeCardIndex: number;
    win?: { shareUsd: number; claimCode: string | null; claimCodes?: string[]; prizeStatus: string; cards?: number } | null;
  };
  participants: Participant[];
  /** Global count of tarjetas (across all players) that completed each column. */
  lettersDone: Record<BingoLetter, number>;
  /** Total tarjetas in play (all players) and how many contain each number 1..75. */
  totalCards: number;
  cardsPerNumber: Record<number, number>;
  chat: ChatMsg[];
  winners?: { nickname: string; avatarUrl: string | null; shareUsd: number; cards: number }[];
};

export const LETTERS: BingoLetter[] = ["B", "I", "N", "G", "O"];

// Classic bingo ball colors, tuned to the qori palette (cheerful, not seedy).
export const LETTER_COLORS: Record<BingoLetter, string> = {
  B: "#3b82f6",
  I: "#ef4444",
  N: "#8b5cf6",
  G: "#10b981",
  O: "#f59e0b",
};

export const LETTER_COLORS_SOFT: Record<BingoLetter, string> = {
  B: "#dbeafe",
  I: "#fee2e2",
  N: "#ede9fe",
  G: "#d1fae5",
  O: "#fef3c7",
};

export function letterForNumber(n: number): BingoLetter {
  if (n <= 15) return "B";
  if (n <= 30) return "I";
  if (n <= 45) return "N";
  if (n <= 60) return "G";
  return "O";
}

/** Column values of a card in B-I-N-G-O order. */
export function cardColumns(card: BingoCard): (number | null)[][] {
  return [card.B, card.I, card.N, card.G, card.O];
}

/** Is a cell marked given the drawn set? Center FREE is always marked. */
export function isMarked(value: number | null, drawn: Set<number>): boolean {
  return value === null || drawn.has(value);
}

/** Fully-marked columns (letters) of a card. */
export function completedLetters(card: BingoCard, drawn: Set<number>): BingoLetter[] {
  const cols = cardColumns(card);
  const out: BingoLetter[] = [];
  cols.forEach((col, i) => {
    if (col.every((v) => isMarked(v, drawn))) out.push(LETTERS[i]);
  });
  return out;
}

/** Marked cell count on a card (FREE counts). */
export function markedCount(card: BingoCard, drawn: Set<number>): number {
  let n = 0;
  for (const col of cardColumns(card)) for (const v of col) if (isMarked(v, drawn)) n++;
  return n;
}

/** Does the card have any complete column? */
export function hasBingo(card: BingoCard, drawn: Set<number>): boolean {
  return completedLetters(card, drawn).length > 0;
}

/** FULL CARD (carton lleno / blackout): all 24 numbers marked. The real win
 *  condition. All 5 columns complete <=> full card. */
export function hasFullCard(card: BingoCard, drawn: Set<number>): boolean {
  return completedLetters(card, drawn).length === LETTERS.length;
}

/** How many numbers are still missing to fill the card (0 = carton lleno).
 *  The FREE center never counts, so the max is 24. */
export function remainingToFill(card: BingoCard, drawn: Set<number>): number {
  let missing = 0;
  for (const col of cardColumns(card)) for (const v of col) if (v !== null && !drawn.has(v)) missing++;
  return missing;
}

/** Letter of the column closest to complete (fewest missing, not yet done);
 *  null once the card is full. Used to highlight "casi" progress. */
export function closestColumn(card: BingoCard, drawn: Set<number>): BingoLetter | null {
  const cols = cardColumns(card);
  let best: BingoLetter | null = null;
  let bestMissing = Infinity;
  cols.forEach((col, i) => {
    const missing = col.reduce((n, v) => n + (v !== null && !drawn.has(v) ? 1 : 0), 0);
    if (missing > 0 && missing < bestMissing) { bestMissing = missing; best = LETTERS[i]; }
  });
  return best;
}
