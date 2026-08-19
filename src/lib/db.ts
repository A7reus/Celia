import { createClient } from "@tursodatabase/serverless/compat";
import type { InStatement } from "@tursodatabase/serverless/compat";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import fs from "node:fs";
import { randomBytes, scryptSync } from "node:crypto";
import type {
  Game,
  GameResult,
  PairingRow,
  Player,
  RatingType,
  RoundRow,
  RoundStatus,
  Row,
  DbHandle,
  PlayerRow,
  PairingRowRaw,
  GameRow,
  Admin,
  AdminSummary,
  AdminRow,
  TournamentRow,
  TournamentUpsert,
  Tournament
} from "@/types";

const DEFAULT_PASSWORD = "admin";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS admins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  is_super INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS tournaments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'intradept',
  time_control TEXT NOT NULL DEFAULT '10+5',
  rounds_count INTEGER NOT NULL DEFAULT 7,
  default_rating INTEGER NOT NULL DEFAULT 1200,
  status TEXT NOT NULL DEFAULT 'active',
  admin_id INTEGER REFERENCES admins(id),
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS players (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tournament_id INTEGER REFERENCES tournaments(id) ON DELETE CASCADE,
  name TEXT NOT NULL COLLATE NOCASE,
  rating INTEGER NOT NULL,
  rating_type TEXT NOT NULL DEFAULT 'manual',
  active INTEGER NOT NULL DEFAULT 1,
  UNIQUE(tournament_id, name)
);
CREATE TABLE IF NOT EXISTS rounds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tournament_id INTEGER REFERENCES tournaments(id) ON DELETE CASCADE,
  number INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  UNIQUE(tournament_id, number)
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
CREATE TABLE IF NOT EXISTS login_limits (
  ip TEXT PRIMARY KEY,
  failures INTEGER NOT NULL DEFAULT 0,
  first_failure INTEGER NOT NULL,
  locked_until INTEGER NOT NULL DEFAULT 0
);
`;

const SCHEMA_INDEXES = `
CREATE INDEX IF NOT EXISTS idx_tournaments_admin ON tournaments(admin_id);
CREATE INDEX IF NOT EXISTS idx_players_tournament ON players(tournament_id);
CREATE INDEX IF NOT EXISTS idx_rounds_tournament ON rounds(tournament_id);
CREATE INDEX IF NOT EXISTS idx_pairings_round ON pairings(round_id);
`;

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

// ---------- database handle (remote Turso, local file fallback) ----------

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
      await ensureColumns(db);
      await migrateLegacyTables(db);
      await migrateLegacy(db);
      await db.exec(SCHEMA_INDEXES);
      await seed(db);
      return db;
    })();
  }
  return globalForDb.__chessDb;
}

async function ensureColumns(db: DbHandle): Promise<void> {
  for (const table of ["players", "rounds"]) {
    const rows = (await db.all(
      `SELECT COUNT(*) AS n FROM pragma_table_info('${table}') WHERE name = 'tournament_id'`
    )) as unknown as { n: number }[];
    if (Number(rows[0]?.n ?? 0) === 0) {
      await db.run(
        `ALTER TABLE ${table} ADD COLUMN tournament_id INTEGER REFERENCES tournaments(id) ON DELETE CASCADE`
      );
    }
  }
}

async function migrateLegacyTables(db: DbHandle): Promise<void> {
  const playersSql = (await db.get("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'players'")) as
    { sql: string } | undefined;
  if (playersSql?.sql && /UNIQUE\s*\(\s*name\s*\)/i.test(playersSql.sql)) {
    await db.exec(`
      DROP TABLE IF EXISTS players_new;
      CREATE TABLE players_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tournament_id INTEGER REFERENCES tournaments(id) ON DELETE CASCADE,
        name TEXT NOT NULL COLLATE NOCASE,
        rating INTEGER NOT NULL,
        rating_type TEXT NOT NULL DEFAULT 'manual',
        active INTEGER NOT NULL DEFAULT 1,
        UNIQUE(tournament_id, name)
      );
      INSERT INTO players_new (id, tournament_id, name, rating, rating_type, active)
        SELECT id, tournament_id, name, rating, rating_type, active FROM players;
      DROP TABLE players;
      ALTER TABLE players_new RENAME TO players;
    `);
  }
  const roundsSql = (await db.get("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'rounds'")) as
    { sql: string } | undefined;
  if (roundsSql?.sql && /UNIQUE\s*\(\s*number\s*\)/i.test(roundsSql.sql)) {
    await db.exec(`
      DROP TABLE IF EXISTS rounds_new;
      CREATE TABLE rounds_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tournament_id INTEGER REFERENCES tournaments(id) ON DELETE CASCADE,
        number INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'draft',
        UNIQUE(tournament_id, number)
      );
      INSERT INTO rounds_new (id, tournament_id, number, status)
        SELECT id, tournament_id, number, status FROM rounds;
      DROP TABLE rounds;
      ALTER TABLE rounds_new RENAME TO rounds;
    `);
  }
}

async function migrateLegacy(db: DbHandle): Promise<void> {
  const legacy = (await db.get("SELECT value FROM settings WHERE key = 'tournament_name'")) as
    { value: string } | undefined;
  if (!legacy) return;
  const tournaments = (await db.get("SELECT COUNT(*) AS n FROM tournaments")) as unknown as { n: number };
  if (Number(tournaments.n) > 0) return;

  const get = async (key: string): Promise<string | undefined> =>
    ((await db.get("SELECT value FROM settings WHERE key = ?", [key])) as { value: string } | undefined)?.value;

  const name = legacy.value || "JUCSE Intradepartment Chess Tournament 2026";
  const adminHash = (await get("admin_password_hash")) ?? hashPassword(DEFAULT_PASSWORD);
  const adminResult = await db.run(
    "INSERT INTO admins (username, password_hash, is_super, created_at) VALUES (?, ?, 1, ?)",
    ["admin", adminHash, Date.now()]
  );
  const adminId = Number(adminResult.lastInsertRowid);

  const tournamentResult = await db.run(
    `INSERT INTO tournaments (slug, name, type, time_control, rounds_count, default_rating, status, admin_id, created_at)
     VALUES ('jucse-2026', ?, 'intradept', ?, ?, ?, 'active', ?, ?)`,
    [
      name,
      (await get("time_control")) ?? "10+5",
      Number((await get("rounds_count")) ?? "7"),
      Number((await get("default_rating")) ?? "1200"),
      adminId,
      Date.now()
    ]
  );
  const tournamentId = Number(tournamentResult.lastInsertRowid);

  await db.run("UPDATE players SET tournament_id = ? WHERE tournament_id IS NULL", [tournamentId]);
  await db.run("UPDATE rounds SET tournament_id = ? WHERE tournament_id IS NULL", [tournamentId]);
  await db.exec(
    "DELETE FROM settings WHERE key IN ('tournament_name', 'time_control', 'rounds_count', 'default_rating', 'admin_password_hash')"
  );
}

async function seed(db: DbHandle): Promise<void> {
  await db.batch([
    {
      sql: "INSERT OR IGNORE INTO settings (key, value) VALUES ('session_secret', ?)",
      args: [randomBytes(32).toString("hex")]
    },
    { sql: "INSERT OR IGNORE INTO settings (key, value) VALUES ('seeded', '1')" }
  ]);
  const admins = (await db.get("SELECT COUNT(*) AS n FROM admins")) as unknown as { n: number };
  if (Number(admins.n) === 0) {
    await db.run("INSERT INTO admins (username, password_hash, is_super, created_at) VALUES (?, ?, 1, ?)", [
      "admin",
      hashPassword(DEFAULT_PASSWORD),
      Date.now()
    ]);
  }
}

// ---------- global settings ----------

export async function getSessionSecret(): Promise<string> {
  const db = await getDb();
  const row = (await db.get("SELECT value FROM settings WHERE key = 'session_secret'")) as
    { value: string } | undefined;
  return row?.value ?? "";
}

export { hashPassword };

// ---------- admins ----------

function toAdmin(row: AdminRow): Admin {
  return {
    id: row.id,
    username: row.username,
    passwordHash: row.password_hash,
    isSuper: row.is_super === 1,
    createdAt: row.created_at
  };
}

function toAdminSummary(row: AdminRow): AdminSummary {
  return {
    id: row.id,
    username: row.username,
    isSuper: row.is_super === 1,
    createdAt: row.created_at
  };
}

export async function listAdmins(): Promise<AdminSummary[]> {
  const db = await getDb();
  const rows = (await db.all(
    "SELECT id, username, is_super, created_at FROM admins ORDER BY is_super DESC, username"
  )) as unknown as AdminRow[];
  return rows.map(toAdminSummary);
}

export async function getAdminById(id: number): Promise<Admin | null> {
  const db = await getDb();
  const row = (await db.get("SELECT * FROM admins WHERE id = ?", [id])) as unknown as AdminRow | undefined;
  return row ? toAdmin(row) : null;
}

export async function getAdminByUsername(username: string): Promise<Admin | null> {
  const db = await getDb();
  const row = (await db.get("SELECT * FROM admins WHERE username = ? COLLATE NOCASE", [username])) as unknown as
    AdminRow | undefined;
  return row ? toAdmin(row) : null;
}

export async function createAdmin(username: string, passwordHash: string, isSuper: boolean): Promise<number> {
  const db = await getDb();
  const result = await db.run(
    "INSERT INTO admins (username, password_hash, is_super, created_at) VALUES (?, ?, ?, ?)",
    [username.trim(), passwordHash, isSuper ? 1 : 0, Date.now()]
  );
  return Number(result.lastInsertRowid);
}

export async function updateAdminPassword(id: number, passwordHash: string): Promise<void> {
  const db = await getDb();
  await db.run("UPDATE admins SET password_hash = ? WHERE id = ?", [passwordHash, id]);
}

export async function deleteAdmin(id: number): Promise<void> {
  const db = await getDb();
  await db.run("DELETE FROM admins WHERE id = ?", [id]);
}

export async function countSuperAdmins(): Promise<number> {
  const db = await getDb();
  const row = (await db.get("SELECT COUNT(*) AS n FROM admins WHERE is_super = 1")) as unknown as { n: number };
  return Number(row.n);
}

// ---------- tournaments ----------

function toTournament(row: TournamentRow): Tournament {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    type: row.type as Tournament["type"],
    timeControl: row.time_control,
    roundsCount: row.rounds_count,
    defaultRating: row.default_rating,
    status: row.status as Tournament["status"],
    adminId: row.admin_id,
    createdAt: row.created_at
  };
}

export async function listTournaments(): Promise<Tournament[]> {
  const db = await getDb();
  const rows = (await db.all(
    "SELECT * FROM tournaments ORDER BY status, created_at DESC"
  )) as unknown as TournamentRow[];
  return rows.map(toTournament);
}

export async function getTournament(id: number): Promise<Tournament | null> {
  const db = await getDb();
  const row = (await db.get("SELECT * FROM tournaments WHERE id = ?", [id])) as unknown as TournamentRow | undefined;
  return row ? toTournament(row) : null;
}

export async function getTournamentBySlug(slug: string): Promise<Tournament | null> {
  const db = await getDb();
  const row = (await db.get("SELECT * FROM tournaments WHERE slug = ? COLLATE NOCASE", [slug])) as unknown as
    TournamentRow | undefined;
  return row ? toTournament(row) : null;
}

export async function createTournament(input: TournamentUpsert): Promise<number> {
  const db = await getDb();
  const result = await db.run(
    `INSERT INTO tournaments (slug, name, type, time_control, rounds_count, default_rating, status, admin_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
    [
      input.slug.trim().toLowerCase(),
      input.name.trim(),
      input.type,
      input.timeControl,
      Math.max(1, Math.round(input.roundsCount)),
      Math.max(0, Math.round(input.defaultRating)),
      input.adminId,
      Date.now()
    ]
  );
  return Number(result.lastInsertRowid);
}

export async function updateTournament(
  id: number,
  patch: { name?: string; slug?: string; type?: Tournament["type"] }
): Promise<void> {
  const db = await getDb();
  await db.run(
    `UPDATE tournaments SET
       name = COALESCE(?, name),
       slug = COALESCE(?, slug),
       type = COALESCE(?, type)
     WHERE id = ?`,
    [patch.name?.trim() ?? null, patch.slug?.trim().toLowerCase() ?? null, patch.type ?? null, id]
  );
}

export async function updateTournamentSettings(
  id: number,
  patch: { timeControl?: string; roundsCount?: number; defaultRating?: number }
): Promise<void> {
  const db = await getDb();
  await db.run(
    `UPDATE tournaments SET
       time_control = COALESCE(?, time_control),
       rounds_count = COALESCE(?, rounds_count),
       default_rating = COALESCE(?, default_rating)
     WHERE id = ?`,
    [
      patch.timeControl ?? null,
      patch.roundsCount != null ? Math.max(1, Math.round(patch.roundsCount)) : null,
      patch.defaultRating != null ? Math.max(0, Math.round(patch.defaultRating)) : null,
      id
    ]
  );
}

export async function setTournamentStatus(id: number, status: Tournament["status"]): Promise<void> {
  const db = await getDb();
  await db.run("UPDATE tournaments SET status = ? WHERE id = ?", [status, id]);
}

export async function setTournamentAdmin(id: number, adminId: number | null): Promise<void> {
  const db = await getDb();
  await db.run("UPDATE tournaments SET admin_id = ? WHERE id = ?", [adminId, id]);
}

export async function deleteTournament(id: number): Promise<void> {
  const db = await getDb();
  await db.run("DELETE FROM tournaments WHERE id = ?", [id]);
}

// ---------- players ----------

function toPlayer(row: PlayerRow): Player {
  return { id: row.id, name: row.name, rating: row.rating, ratingType: row.rating_type, active: row.active };
}

export async function listPlayers(tournamentId: number, includeInactive = false): Promise<Player[]> {
  const db = await getDb();
  const rows = (await db.all(
    `SELECT id, name, rating, rating_type, active FROM players
     WHERE tournament_id = ? AND (? = 1 OR active = 1)
     ORDER BY active DESC, name COLLATE NOCASE ASC`,
    [tournamentId, includeInactive ? 1 : 0]
  )) as unknown as PlayerRow[];
  return rows.map(toPlayer);
}

export async function addPlayer(
  tournamentId: number,
  name: string,
  rating: number,
  ratingType: RatingType
): Promise<Player> {
  const db = await getDb();
  const result = await db.run("INSERT INTO players (tournament_id, name, rating, rating_type) VALUES (?, ?, ?, ?)", [
    tournamentId,
    name.trim(),
    Math.max(0, Math.round(rating)),
    ratingType
  ]);
  return (await getPlayer(tournamentId, Number(result.lastInsertRowid)))!;
}

export async function getPlayer(tournamentId: number, id: number): Promise<Player | null> {
  const db = await getDb();
  const row = (await db.get(
    "SELECT id, name, rating, rating_type, active FROM players WHERE id = ? AND tournament_id = ?",
    [id, tournamentId]
  )) as unknown as PlayerRow | undefined;
  return row ? toPlayer(row) : null;
}

export async function updatePlayer(
  tournamentId: number,
  id: number,
  name: string,
  rating: number,
  ratingType: RatingType
): Promise<void> {
  const db = await getDb();
  await db.run("UPDATE players SET name = ?, rating = ?, rating_type = ? WHERE id = ? AND tournament_id = ?", [
    name.trim(),
    Math.max(0, Math.round(rating)),
    ratingType,
    id,
    tournamentId
  ]);
}

export async function setPlayerActive(tournamentId: number, id: number, active: boolean): Promise<void> {
  const db = await getDb();
  await db.run("UPDATE players SET active = ? WHERE id = ? AND tournament_id = ?", [active ? 1 : 0, id, tournamentId]);
}

export async function playerHasGames(tournamentId: number, playerId: number): Promise<boolean> {
  const db = await getDb();
  const row = (await db.get("SELECT COUNT(*) AS n FROM pairings WHERE white_id = ? OR black_id = ? OR bye_for_id = ?", [
    playerId,
    playerId,
    playerId
  ])) as unknown as { n: number };
  return row.n > 0;
}

export async function deletePlayer(tournamentId: number, playerId: number): Promise<void> {
  const db = await getDb();
  await db.run("DELETE FROM players WHERE id = ? AND tournament_id = ?", [playerId, tournamentId]);
}

// ---------- rounds & pairings ----------

function toRound(row: { id: number; number: number; status: string }): RoundRow {
  return { id: row.id, number: row.number, status: row.status as RoundStatus };
}

export async function listRounds(tournamentId: number): Promise<RoundRow[]> {
  const db = await getDb();
  const rows = (await db.all("SELECT id, number, status FROM rounds WHERE tournament_id = ? ORDER BY number", [
    tournamentId
  ])) as unknown as { id: number; number: number; status: string }[];
  return rows.map(toRound);
}

export async function getRound(tournamentId: number, roundId: number): Promise<RoundRow | null> {
  const db = await getDb();
  const row = (await db.get("SELECT id, number, status FROM rounds WHERE id = ? AND tournament_id = ?", [
    roundId,
    tournamentId
  ])) as unknown as { id: number; number: number; status: string } | undefined;
  return row ? toRound(row) : null;
}

export async function getRoundByNumber(tournamentId: number, number: number): Promise<RoundRow | null> {
  const db = await getDb();
  const row = (await db.get("SELECT id, number, status FROM rounds WHERE tournament_id = ? AND number = ?", [
    tournamentId,
    number
  ])) as unknown as { id: number; number: number; status: string } | undefined;
  return row ? toRound(row) : null;
}

export async function createRound(tournamentId: number, number: number): Promise<RoundRow> {
  const db = await getDb();
  const result = await db.run("INSERT INTO rounds (tournament_id, number, status) VALUES (?, ?, 'draft')", [
    tournamentId,
    number
  ]);
  return (await getRound(tournamentId, Number(result.lastInsertRowid)))!;
}

export async function deleteRound(tournamentId: number, roundId: number): Promise<void> {
  const db = await getDb();
  await db.run("DELETE FROM rounds WHERE id = ? AND tournament_id = ?", [roundId, tournamentId]);
}

export async function resetTournament(tournamentId: number): Promise<void> {
  const db = await getDb();
  await db.run("DELETE FROM rounds WHERE tournament_id = ?", [tournamentId]);
}

export async function setRoundStatus(tournamentId: number, roundId: number, status: RoundStatus): Promise<void> {
  const db = await getDb();
  await db.run("UPDATE rounds SET status = ? WHERE id = ? AND tournament_id = ?", [status, roundId, tournamentId]);
}

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

export async function completedRounds(tournamentId: number): Promise<RoundRow[]> {
  return (await listRounds(tournamentId)).filter((r) => r.status === "completed");
}

export async function lastCompletedRoundNumber(tournamentId: number): Promise<number> {
  const rounds = await completedRounds(tournamentId);
  return rounds.length > 0 ? rounds[rounds.length - 1].number : 0;
}

export async function nextRoundNumber(tournamentId: number): Promise<number> {
  return (await lastCompletedRoundNumber(tournamentId)) + 1;
}

export async function currentPublicRound(tournamentId: number): Promise<RoundRow | null> {
  const rounds = (await listRounds(tournamentId)).filter((r) => r.status !== "draft");
  return rounds.length > 0 ? rounds[rounds.length - 1] : null;
}

export async function allGames(tournamentId: number): Promise<Game[]> {
  const db = await getDb();
  const rows = (await db.all(
    `SELECT r.number AS round, p.white_id, p.black_id, p.result, p.is_bye, p.bye_for_id
     FROM pairings p JOIN rounds r ON r.id = p.round_id
     WHERE r.tournament_id = ? AND r.status = 'completed'
     ORDER BY r.number, p.board`,
    [tournamentId]
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

export async function playerNameMap(tournamentId: number): Promise<Map<number, string>> {
  const map = new Map<number, string>();
  for (const p of await listPlayers(tournamentId, true)) {
    map.set(p.id, p.name);
  }
  return map;
}
