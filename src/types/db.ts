import type { InStatement } from "@tursodatabase/serverless/compat";
import type { RatingType } from "./models";

export type Settings = {
  tournamentName: string;
  timeControl: string;
  roundsCount: number;
  defaultRating: number;
  adminPasswordHash: string;
  sessionSecret: string;
};

export type Row = Record<string, unknown>;

export type DbHandle = {
  all(sql: string, args?: (string | number | null)[]): Promise<Row[]>;
  get(sql: string, args?: (string | number | null)[]): Promise<Row | undefined>;
  run(sql: string, args?: (string | number | null)[]): Promise<{ lastInsertRowid: number }>;
  exec(sql: string): Promise<void>;
  batch(stmts: InStatement[]): Promise<void>;
};

export type PlayerRow = {
  id: number;
  name: string;
  rating: number;
  rating_type: RatingType;
  active: number;
};

export type PairingRowRaw = {
  id: number;
  round_id: number;
  board: number;
  white_id: number | null;
  black_id: number | null;
  result: string | null;
  is_bye: number;
  bye_for_id: number | null;
};

export type GameRow = {
  round: number;
  white_id: number | null;
  black_id: number | null;
  result: string | null;
  is_bye: number;
  bye_for_id: number | null;
};
