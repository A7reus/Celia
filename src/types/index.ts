export type RatingType = "manual" | "fide";

export type GameResult = "1-0" | "0-1" | "1/2" | "+" | "-";

export type Player = {
  id: number;
  name: string;
  rating: number;
  ratingType: RatingType;
  active: number;
};

export type Game = {
  round: number;
  whiteId: number | null;
  blackId: number | null;
  result: GameResult | null;
  isBye: boolean;
  byeForId: number | null;
};

export type PlayerGameRow = {
  round: number;
  opponentId: number | null;
  opponentName: string | null;
  color: "w" | "b" | null;
  result: GameResult | null;
  isBye: boolean;
};

export type Standing = {
  playerId: number;
  name: string;
  rating: number;
  ratingType: RatingType;
  score: number;
  wins: number;
  draws: number;
  losses: number;
  byes: number;
  played: number;
  buchholz: number;
  medianBuchholz: number;
  sonnebornBerger: number;
  koya: number;
  tpr: number | null;
  whiteCount: number;
  blackCount: number;
  games: PlayerGameRow[];
};

export type StandingWithRank = Standing & {
  rank: number;
};

export type RoundStatus = "draft" | "published" | "completed";

export type RoundRow = {
  id: number;
  number: number;
  status: RoundStatus;
};

export type PairingRow = {
  id: number;
  roundId: number;
  board: number;
  whiteId: number | null;
  blackId: number | null;
  result: GameResult | null;
  isBye: boolean;
  byeForId: number | null;
};

export type PairingPlan = {
  board: number;
  whiteId: number | null;
  blackId: number | null;
  isBye: boolean;
  byeForId: number | null;
  warning?: string;
};

export type SimulatedRound = {
  round: number;
  pairings: {
    whiteId: number | null;
    blackId: number | null;
    result: GameResult | null;
    isBye: boolean;
    byeForId: number | null;
  }[];
};
