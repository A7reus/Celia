export type RatingType = "manual" | "fide";

export type TournamentType = "intradept" | "interdept" | "other";

export type TournamentStatus = "active" | "archived";

export type Tournament = {
  id: number;
  slug: string;
  name: string;
  type: TournamentType;
  timeControl: string;
  roundsCount: number;
  defaultRating: number;
  status: TournamentStatus;
  adminId: number | null;
  createdAt: number;
};

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
