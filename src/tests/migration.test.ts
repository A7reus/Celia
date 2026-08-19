import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

let tmp: string;

beforeAll(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "chess-mig-"));
  vi.stubEnv("TURSO_DATABASE_URL", "");
  vi.stubEnv("TURSO_AUTH_TOKEN", "");
  vi.stubEnv("CHESS_DATA_DIR", tmp);
});

afterAll(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

async function reload() {
  vi.resetModules();
  const auth = await import("../lib/auth");
  const db = await import("../lib/db");
  return { auth, db };
}

describe("schema v2 migration", () => {
  it("migrates a legacy v1 database into a tournament owned by a super admin", async () => {
    fs.mkdirSync(path.join(tmp, "legacy"), { recursive: true });
    const dbPath = path.join(tmp, "legacy", "chess.db");
    const db = new DatabaseSync(dbPath);
    db.exec(`
      CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE players (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL COLLATE NOCASE,
        rating INTEGER NOT NULL,
        rating_type TEXT NOT NULL DEFAULT 'manual',
        active INTEGER NOT NULL DEFAULT 1,
        UNIQUE(name)
      );
      CREATE TABLE rounds (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        number INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'draft',
        UNIQUE(number)
      );
      CREATE TABLE pairings (
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
      INSERT INTO settings VALUES ('tournament_name', 'JUCSE Intradepartment Chess Tournament 2026');
      INSERT INTO settings VALUES ('time_control', '10+5');
      INSERT INTO settings VALUES ('rounds_count', '7');
      INSERT INTO settings VALUES ('default_rating', '1200');
      INSERT INTO settings VALUES ('admin_password_hash', 'scrypt$testsalt$testhash');
      INSERT INTO settings VALUES ('session_secret', 'secret');
      INSERT INTO settings VALUES ('seeded', '1');
      INSERT INTO players (name, rating, rating_type) VALUES ('Alice', 1400, 'manual');
      INSERT INTO players (name, rating, rating_type) VALUES ('Bob', 1300, 'fide');
      INSERT INTO rounds (number, status) VALUES (1, 'completed');
    `);
    db.close();

    vi.stubEnv("CHESS_DATA_DIR", path.join(tmp, "legacy"));
    const { db: lib } = await reload();

    const admins = await lib.listAdmins();
    expect(admins).toHaveLength(1);
    expect(admins[0]).toMatchObject({ username: "admin", isSuper: true });

    const tournaments = await lib.listTournaments();
    expect(tournaments).toHaveLength(1);
    expect(tournaments[0]).toMatchObject({
      slug: "jucse-2026",
      type: "intradept",
      adminId: admins[0].id
    });

    const players = await lib.listPlayers(tournaments[0].id);
    expect(players.map((p) => p.name).sort()).toEqual(["Alice", "Bob"]);
    const rounds = await lib.listRounds(tournaments[0].id);
    expect(rounds.map((r) => r.number)).toEqual([1]);

    const handle = await lib.getDb();
    const keys = (await handle.all("SELECT key FROM settings")).map((r) => String(r.key));
    expect(keys).not.toContain("tournament_name");
    expect(keys).toContain("session_secret");
  });

  it("is idempotent: a second startup does not duplicate admins or tournaments", async () => {
    const { db: lib } = await reload();
    expect(await lib.listAdmins()).toHaveLength(1);
    expect(await lib.listTournaments()).toHaveLength(1);
  });

  it("scopes players and rounds per tournament", async () => {
    const { db: lib } = await reload();
    const [t1] = await lib.listTournaments();
    const t2Id = await lib.createTournament({
      name: "Second Tournament",
      slug: "second",
      type: "interdept",
      timeControl: "5+3",
      roundsCount: 5,
      defaultRating: 1000,
      adminId: null
    });
    const p1 = await lib.addPlayer(t1.id, "Carol", 1400, "manual");
    const p2 = await lib.addPlayer(t2Id, "Dave", 1200, "manual");

    expect((await lib.listPlayers(t1.id)).map((p) => p.id)).toContain(p1.id);
    expect((await lib.listPlayers(t1.id)).map((p) => p.id)).not.toContain(p2.id);
    expect((await lib.listPlayers(t2Id)).map((p) => p.id)).toEqual([p2.id]);
    expect(await lib.getPlayer(t1.id, p2.id)).toBeNull();
    expect(await lib.getPlayer(t2Id, p1.id)).toBeNull();

    const r1 = await lib.createRound(t1.id, 2);
    const r2 = await lib.createRound(t2Id, 1);
    expect((await lib.listRounds(t1.id)).map((r) => r.id)).toContain(r1.id);
    expect((await lib.listRounds(t1.id)).map((r) => r.id)).not.toContain(r2.id);
    expect((await lib.listRounds(t2Id)).map((r) => r.id)).toEqual([r2.id]);
    expect(await lib.getRoundByNumber(t1.id, 2)).toMatchObject({ id: r1.id });
    expect(await lib.getRoundByNumber(t2Id, 1)).toMatchObject({ id: r2.id });
    expect(await lib.getRoundByNumber(t2Id, 2)).toBeNull();
  });

  it("allows the same player name in different tournaments", async () => {
    const { db: lib } = await reload();
    const [t1] = await lib.listTournaments();
    const t2Id = await lib.createTournament({
      name: "Third Tournament",
      slug: "third",
      type: "other",
      timeControl: "10+0",
      roundsCount: 3,
      defaultRating: 1200,
      adminId: null
    });
    const a = await lib.addPlayer(t1.id, "Same Name", 1200, "manual");
    const b = await lib.addPlayer(t2Id, "Same Name", 1300, "fide");
    expect(a.id).not.toBe(b.id);
    await expect(lib.addPlayer(t1.id, "Same Name", 1200, "manual")).rejects.toThrow();
  });
});

describe("auth sessions v2", () => {
  it("issues a scoped token and rejects tampered tokens", async () => {
    const { auth } = await reload();
    const secret = "test-secret";
    const token = auth.createSessionToken(secret, 7, true);
    const payload = auth.verifySessionToken(token, secret);
    expect(payload).toMatchObject({ v: 2, uid: 7, isSuper: true });
    expect(auth.verifySessionToken(`${token}x`, secret)).toBeNull();
    expect(auth.verifySessionToken(token, "wrong-secret")).toBeNull();
    expect(auth.verifySessionToken(undefined, secret)).toBeNull();
  });
});
