import { createClient } from "@tursodatabase/serverless/compat";
import type { InStatement } from "@tursodatabase/serverless/compat";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import fs from "node:fs";
import { randomBytes, scryptSync } from "node:crypto";
import type { Game, GameResult, PairingRow, Player, RatingType, RoundRow, RoundStatus } from "@/types";

const DEFAULT_PASSWORD = "admin";

export type Settings = {
  tournamentName: string;
  timeControl: string;
  roundsCount: number;
  defaultRating: number;
  adminPasswordHash: string;
  sessionSecret: string;
};

const SCHEMA = `
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS players (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  rating INTEGER NOT NULL,
  rating_type TEXT NOT NULL DEFAULT 'manual',
  active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS rounds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  number INTEGER NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'draft'
);
CREATE TABLE IF NOT EXISTS pairings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  round_id INTEGER NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  board INTEGER NOT NULL,
  white_id INTEGER REFERENCES players(id),
  black_id INTEGER REFERENCES players(id),
  result TEXT,
  is_bye INTEGER NOT NULL DEFAULT 0,
  bye_for_id INTEGER REFERENCES players(id),
  UNIQUE(round_id, board)
);
CREATE INDEX IF NOT EXISTS idx_pairings_round ON pairings(round_id);
CREATE TABLE IF NOT EXISTS login_limits (
  ip TEXT PRIMARY KEY,
  failures INTEGER NOT NULL DEFAULT 0,
  first_failure INTEGER NOT NULL,
  locked_until INTEGER NOT NULL DEFAULT 0
);
`;

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

// ---------- database handle (remote Turso, local file fallback) ----------

type Row = Record<string, unknown>;

interface DbHandle {
  all(sql: string, args?: (string | number | null)[]): Promise<Row[]>;
  get(sql: string, args?: (string | number | null)[]): Promise<Row | undefined>;
  run(sql: string, args?: (string | number | null)[]): Promise<{ lastInsertRowid: number }>;
  exec(sql: string): Promise<void>;
  batch(stmts: InStatement[]): Promise<void>;
}

function remoteHandle(url: string, token: string): DbHandle {
  const client = createClient({ url, authToken: token });
  return {
    async all(sql, args) {
      return (await client.execute({ sql, args: args ?? [] })).rows as unknown as Row[];
    },
    async get(sql, args) {
      return (await client.execute({ sql, args: args ?? [] })).rows[0] as Row | undefined;
    },
    async run(sql, args) {
      const result = await client.execute({ sql, args: args ?? [] });
      return { lastInsertRowid: Number(result.lastInsertRowid ?? 0) };
    },
    async exec(sql) {
      await client.executeMultiple(sql);
    },
    async batch(stmts) {
      await client.batch(stmts);
    }
  };
}

function localHandle(dbPath: string): DbHandle {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec(SCHEMA);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
  return {
    async all(sql, args) {
      return db.prepare(sql).all(...(args ?? [])) as Row[];
    },
    async get(sql, args) {
      return db.prepare(sql).get(...(args ?? [])) as Row | undefined;
    },
    async run(sql, args) {
      const result = db.prepare(sql).run(...(args ?? []));
      return { lastInsertRowid: Number(result.lastInsertRowid) };
    },
    async exec(sql) {
      db.exec(sql);
    },
    async batch(stmts) {
      for (const stmt of stmts) {
        const { sql, args } = typeof stmt === "string" ? { sql: stmt, args: [] } : stmt;
        db.prepare(sql).run(...(Array.isArray(args) ? (args as (string | number | null)[]) : []));
      }
    }
  };
}

const globalForDb = globalThis as unknown as { __chessDb?: Promise<DbHandle> };

export function getDb(): Promise<DbHandle> {
  if (!globalForDb.__chessDb) {
    globalForDb.__chessDb = (async () => {
      const url = process.env.TURSO_DATABASE_URL;
      const token = process.env.TURSO_AUTH_TOKEN;
      const dataDir = process.env.CHESS_DATA_DIR ?? path.join(process.cwd(), "data");
      const db = url && token ? remoteHandle(url, token) : localHandle(path.join(dataDir, "chess.db"));
      await db.exec(SCHEMA);
      await seed(db);
      return db;
    })();
  }
  return globalForDb.__chessDb;
}

async function seed(db: DbHandle): Promise<void> {
  const existing = await db.get("SELECT value FROM settings WHERE key = 'seeded'");
  if (existing) return;
  await db.exec(SCHEMA);
  await db.batch([
    {
      sql: "INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)",
      args: ["tournament_name", "JUCSE Intradepartment Chess Tournament 2026"]
    },
    { sql: "INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)", args: ["time_control", "10+5"] },
    { sql: "INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)", args: ["rounds_count", "7"] },
    { sql: "INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)", args: ["default_rating", "1200"] },
    {
      sql: "INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)",
      args: ["admin_password_hash", hashPassword(DEFAULT_PASSWORD)]
    },
    {
      sql: "INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)",
      args: ["session_secret", randomBytes(32).toString("hex")]
    },
    { sql: "INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)", args: ["seeded", "1"] }
  ]);
}

// ---------- settings ----------

const SETTING_DEFAULTS: Record<string, string> = {
  tournament_name: "JUCSE Intradepartment Chess Tournament 2026",
  time_control: "10+5",
  rounds_count: "7",
  default_rating: "1200"
};

export async function getSetting(key: string): Promise<string> {
  const db = await getDb();
  const row = (await db.get("SELECT value FROM settings WHERE key = ?", [key])) as unknown as
    { value: string } | undefined;
  return row?.value ?? SETTING_DEFAULTS[key] ?? "";
}

export async function setSetting(key: string, value: string): Promise<void> {
  const db = await getDb();
  await db.run(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    [key, value]
  );
}

export async function getSettings(): Promise<Settings> {
  const db = await getDb();
  const rows = (await db.all("SELECT key, value FROM settings")) as unknown as { key: string; value: string }[];
  const map = new Map(rows.map((r) => [r.key, r.value]));
  const get = (key: string, fallback: string) => map.get(key) ?? fallback;
  return {
    tournamentName: get("tournament_name", "JUCSE Intradepartment Chess Tournament 2026"),
    timeControl: get("time_control", "10+5"),
    roundsCount: Number(get("rounds_count", "7")) || 7,
    defaultRating: Number(get("default_rating", "1200")) || 1200,
    adminPasswordHash: get("admin_password_hash", ""),
    sessionSecret: get("session_secret", "")
  };
}

export async function setAdminPasswordHash(hash: string): Promise<void> {
  await setSetting("admin_password_hash", hash);
}

export { hashPassword };

// ---------- players ----------

type PlayerRow = {
  id: number;
  name: string;
  rating: number;
  rating_type: RatingType;
  active: number;
};

function toPlayer(row: PlayerRow): Player {
  return { id: row.id, name: row.name, rating: row.rating, ratingType: row.rating_type, active: row.active };
}

export async function listPlayers(includeInactive = false): Promise<Player[]> {
  const db = await getDb();
  const rows = (await db.all(
    `SELECT id, name, rating, rating_type, active FROM players
     WHERE (? = 1 OR active = 1)
     ORDER BY active DESC, name COLLATE NOCASE ASC`,
    [includeInactive ? 1 : 0]
  )) as unknown as PlayerRow[];
  return rows.map(toPlayer);
}

export async function addPlayer(name: string, rating: number, ratingType: RatingType): Promise<Player> {
  const db = await getDb();
  const result = await db.run("INSERT INTO players (name, rating, rating_type) VALUES (?, ?, ?)", [
    name.trim(),
    Math.max(0, Math.round(rating)),
    ratingType
  ]);
  return (await getPlayer(Number(result.lastInsertRowid)))!;
}

export async function getPlayer(id: number): Promise<Player | null> {
  const db = await getDb();
  const row = (await db.get("SELECT id, name, rating, rating_type, active FROM players WHERE id = ?", [
    id
  ])) as unknown as PlayerRow | undefined;
  return row ? toPlayer(row) : null;
}

export async function updatePlayer(id: number, name: string, rating: number, ratingType: RatingType): Promise<void> {
  const db = await getDb();
  await db.run("UPDATE players SET name = ?, rating = ?, rating_type = ? WHERE id = ?", [
    name.trim(),
    Math.max(0, Math.round(rating)),
    ratingType,
    id
  ]);
}

export async function setPlayerActive(id: number, active: boolean): Promise<void> {
  const db = await getDb();
  await db.run("UPDATE players SET active = ? WHERE id = ?", [active ? 1 : 0, id]);
}

// ---------- rounds & pairings ----------

function toRound(row: { id: number; number: number; status: string }): RoundRow {
  return { id: row.id, number: row.number, status: row.status as RoundStatus };
}

export async function listRounds(): Promise<RoundRow[]> {
  const db = await getDb();
  const rows = (await db.all("SELECT id, number, status FROM rounds ORDER BY number")) as unknown as {
    id: number;
    number: number;
    status: string;
  }[];
  return rows.map(toRound);
}

export async function getRound(roundId: number): Promise<RoundRow | null> {
  const db = await getDb();
  const row = (await db.get("SELECT id, number, status FROM rounds WHERE id = ?", [roundId])) as unknown as
    { id: number; number: number; status: string } | undefined;
  return row ? toRound(row) : null;
}

export async function getRoundByNumber(number: number): Promise<RoundRow | null> {
  const db = await getDb();
  const row = (await db.get("SELECT id, number, status FROM rounds WHERE number = ?", [number])) as unknown as
    { id: number; number: number; status: string } | undefined;
  return row ? toRound(row) : null;
}

export async function createRound(number: number): Promise<RoundRow> {
  const db = await getDb();
  const result = await db.run("INSERT INTO rounds (number, status) VALUES (?, 'draft')", [number]);
  return (await getRound(Number(result.lastInsertRowid)))!;
}

export async function deleteRound(roundId: number): Promise<void> {
  const db = await getDb();
  await db.run("DELETE FROM rounds WHERE id = ?", [roundId]);
}

export async function resetTournament(): Promise<void> {
  const db = await getDb();
  await db.run("DELETE FROM rounds");
}

export async function playerHasGames(playerId: number): Promise<boolean> {
  const db = await getDb();
  const row = (await db.get("SELECT COUNT(*) AS n FROM pairings WHERE white_id = ? OR black_id = ? OR bye_for_id = ?", [
    playerId,
    playerId,
    playerId
  ])) as unknown as { n: number };
  return row.n > 0;
}

export async function deletePlayer(playerId: number): Promise<void> {
  const db = await getDb();
  await db.run("DELETE FROM players WHERE id = ?", [playerId]);
}

export async function setRoundStatus(roundId: number, status: RoundStatus): Promise<void> {
  const db = await getDb();
  await db.run("UPDATE rounds SET status = ? WHERE id = ?", [status, roundId]);
}

type PairingRowRaw = {
  id: number;
  round_id: number;
  board: number;
  white_id: number | null;
  black_id: number | null;
  result: string | null;
  is_bye: number;
  bye_for_id: number | null;
};

function toPairing(row: PairingRowRaw): PairingRow {
  return {
    id: row.id,
    roundId: row.round_id,
    board: row.board,
    whiteId: row.white_id,
    blackId: row.black_id,
    result: (row.result as GameResult) ?? null,
    isBye: row.is_bye === 1,
    byeForId: row.bye_for_id
  };
}

export async function listPairings(roundId: number): Promise<PairingRow[]> {
  const db = await getDb();
  const rows = (await db.all("SELECT * FROM pairings WHERE round_id = ? ORDER BY board", [
    roundId
  ])) as unknown as PairingRowRaw[];
  return rows.map(toPairing);
}

export async function getPairing(pairingId: number): Promise<PairingRow | null> {
  const db = await getDb();
  const row = (await db.get("SELECT * FROM pairings WHERE id = ?", [pairingId])) as unknown as
    PairingRowRaw | undefined;
  return row ? toPairing(row) : null;
}

export async function replacePairings(
  roundId: number,
  pairs: { board: number; whiteId: number | null; blackId: number | null; isBye: boolean; byeForId: number | null }[]
): Promise<void> {
  const db = await getDb();
  await db.run("DELETE FROM pairings WHERE round_id = ?", [roundId]);
  const stmts: InStatement[] = pairs.map((p) => ({
    sql: `INSERT INTO pairings (round_id, board, white_id, black_id, is_bye, bye_for_id)
          VALUES (?, ?, ?, ?, ?, ?)`,
    args: [roundId, p.board, p.whiteId, p.blackId, p.isBye ? 1 : 0, p.byeForId]
  }));
  if (stmts.length > 0) await db.batch(stmts);
}

export async function setPairingResult(pairingId: number, result: GameResult | null): Promise<void> {
  const db = await getDb();
  await db.run("UPDATE pairings SET result = ? WHERE id = ?", [result, pairingId]);
}

// ---------- tournament state ----------

export async function completedRounds(): Promise<RoundRow[]> {
  return (await listRounds()).filter((r) => r.status === "completed");
}

export async function lastCompletedRoundNumber(): Promise<number> {
  const rounds = await completedRounds();
  return rounds.length > 0 ? rounds[rounds.length - 1].number : 0;
}

export async function nextRoundNumber(): Promise<number> {
  return (await lastCompletedRoundNumber()) + 1;
}

export async function currentPublicRound(): Promise<RoundRow | null> {
  const rounds = (await listRounds()).filter((r) => r.status !== "draft");
  return rounds.length > 0 ? rounds[rounds.length - 1] : null;
}

export type GameRow = {
  round: number;
  white_id: number | null;
  black_id: number | null;
  result: string | null;
  is_bye: number;
  bye_for_id: number | null;
};

export async function allGames(): Promise<Game[]> {
  const db = await getDb();
  const rows = (await db.all(
    `SELECT r.number AS round, p.white_id, p.black_id, p.result, p.is_bye, p.bye_for_id
     FROM pairings p JOIN rounds r ON r.id = p.round_id
     WHERE r.status = 'completed'
     ORDER BY r.number, p.board`
  )) as unknown as GameRow[];
  return rows.map((g) => ({
    round: g.round,
    whiteId: g.white_id,
    blackId: g.black_id,
    result: (g.result as GameResult) ?? null,
    isBye: g.is_bye === 1,
    byeForId: g.bye_for_id
  }));
}

export async function playerNameMap(): Promise<Map<number, string>> {
  const map = new Map<number, string>();
  for (const p of await listPlayers(true)) {
    map.set(p.id, p.name);
  }
  return map;
}
