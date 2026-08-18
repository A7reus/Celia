export type PairingPlan = {
  board: number;
  whiteId: number | null;
  blackId: number | null;
  isBye: boolean;
  byeForId: number | null;
  warning?: string;
};

export type Board = {
  whiteId: number | null;
  blackId: number | null;
  isBye: boolean;
  byeForId: number | null;
};

export type ColorState = {
  diff: number;
  lastColors: ("w" | "b")[];
};

export type PairGroupResult = {
  pairs: { whiteId: number; blackId: number; penalty: number }[];
  floater: number | null;
  allowRepeats: boolean;
  colorRelaxed: boolean;
};

export type PairSearchOptions = {
  allowRepeats: boolean;
  strictColors: boolean;
};
