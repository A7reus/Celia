import type { PlayerGameRow, RatingType } from "./models";

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

export type PlayerAgg = {
  score: number;
  wins: number;
  draws: number;
  losses: number;
  byes: number;
  played: number;
  opponents: { id: number; score: number; real: boolean }[];
  realOpponentIds: number[];
  oppRatings: number[];
  whiteCount: number;
  blackCount: number;
  games: Standing["games"];
};
