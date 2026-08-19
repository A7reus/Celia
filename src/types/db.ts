import type { InStatement } from "@tursodatabase/serverless/compat";
import type { RatingType, TournamentType } from "./models";

export type Admin = {
  id: number;
  username: string;
  passwordHash: string;
  isSuper: boolean;
  createdAt: number;
};

export type AdminSummary = {
  id: number;
  username: string;
  isSuper: boolean;
  createdAt: number;
};

export type AdminRow = {
  id: number;
  username: string;
  password_hash: string;
  is_super: number;
  created_at: number;
};

export type TournamentRow = {
  id: number;
  slug: string;
  name: string;
  type: string;
  time_control: string;
  rounds_count: number;
  default_rating: number;
  status: string;
  admin_id: number | null;
  created_at: number;
};

export type TournamentUpsert = {
  name: string;
  slug: string;
  type: TournamentType;
  timeControl: string;
  roundsCount: number;
  defaultRating: number;
  adminId: number | null;
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
