import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

let tmp: string;

beforeAll(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "chess-db-"));
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

async function createTournament(db: Awaited<ReturnType<typeof reload>>["db"], name: string) {
  return db.createTournament({
    name,
    slug: `slug-${Math.random().toString(36).slice(2)}`,
    description: null,
    type: "intradept",
    timeControl: "10+5",
    roundsCount: 7,
    defaultRating: 1200,
    adminId: null
  });
}

describe("database bootstrap", () => {
  it("seeds a default super admin and no tournaments", async () => {
    const { db } = await reload();
    const admins = await db.listAdmins();
    expect(admins).toHaveLength(1);
    expect(admins[0]).toMatchObject({ username: "admin", isSuper: true });
    expect(await db.listTournaments()).toHaveLength(0);
  });

  it("is idempotent: a second startup does not duplicate admins", async () => {
    const { db } = await reload();
    expect(await db.listAdmins()).toHaveLength(1);
  });
});

describe("tournaments", () => {
  it("stores description and allows searching by name or description", async () => {
    const { db } = await reload();
    const t1 = await db.createTournament({
      name: "Spring Open",
      slug: "spring-open",
      description: "Friendly weekend tournament, 7 rounds",
      type: "other",
      timeControl: "10+5",
      roundsCount: 7,
      defaultRating: 1200,
      adminId: null
    });
    await db.createTournament({
      name: "Winter Classic",
      slug: "winter-classic",
      description: null,
      type: "interdept",
      timeControl: "5+3",
      roundsCount: 5,
      defaultRating: 1000,
      adminId: null
    });

    expect((await db.getTournament(t1))!.description).toBe("Friendly weekend tournament, 7 rounds");
    expect((await db.listTournaments("spring")).map((t) => t.id)).toEqual([t1]);
    expect((await db.listTournaments("weekend")).map((t) => t.id)).toEqual([t1]);
    expect((await db.listTournaments("winter")).map((t) => t.id)).not.toContain(t1);
    expect((await db.listTournaments("")).length).toBe(2);
    expect((await db.listTournaments("%")).length).toBe(0);
    expect((await db.listTournaments("_")).length).toBe(0);
  });

  it("allows the same name in different tournaments with unique slugs", async () => {
    const { db } = await reload();
    const a = await createTournament(db, "Same Name");
    const b = await createTournament(db, "Same Name");
    expect(a).not.toBe(b);
    const [ta, tb] = await db.listTournaments();
    expect(ta.slug).not.toBe(tb.slug);
  });

  it("clears a description when updated with an empty value", async () => {
    const { db } = await reload();
    const id = await db.createTournament({
      name: "With Description",
      slug: "with-description",
      description: "something",
      type: "other",
      timeControl: "10+5",
      roundsCount: 7,
      defaultRating: 1200,
      adminId: null
    });
    await db.updateTournament(id, { description: " " });
    expect((await db.getTournament(id))!.description).toBeNull();
  });

  it("wipeAllData removes tournaments and non-super admins, keeping super admins", async () => {
    const { db } = await reload();
    const id = await createTournament(db, "To Be Wiped");
    await db.addPlayer(id, "Alice", 1400, "manual");
    await db.createRound(id, 1);
    await db.createAdmin("regular", "scrypt$salt$hash", false);

    await db.wipeAllData();

    expect(await db.listTournaments()).toHaveLength(0);
    expect((await db.listPlayers(id)).length).toBe(0);
    expect((await db.listRounds(id)).length).toBe(0);
    const admins = await db.listAdmins();
    expect(admins).toHaveLength(1);
    expect(admins[0]).toMatchObject({ username: "admin", isSuper: true });
  });
});

describe("per-tournament scoping", () => {
  it("scopes players and rounds per tournament", async () => {
    const { db } = await reload();
    const t1 = await createTournament(db, "First Tournament");
    const t2 = await createTournament(db, "Second Tournament");
    const p1 = await db.addPlayer(t1, "Carol", 1400, "manual");
    const p2 = await db.addPlayer(t2, "Dave", 1200, "manual");

    expect((await db.listPlayers(t1)).map((p) => p.id)).toContain(p1.id);
    expect((await db.listPlayers(t1)).map((p) => p.id)).not.toContain(p2.id);
    expect((await db.listPlayers(t2)).map((p) => p.id)).toEqual([p2.id]);
    expect(await db.getPlayer(t1, p2.id)).toBeNull();
    expect(await db.getPlayer(t2, p1.id)).toBeNull();

    const r1 = await db.createRound(t1, 2);
    const r2 = await db.createRound(t2, 1);
    expect((await db.listRounds(t1)).map((r) => r.id)).toContain(r1.id);
    expect((await db.listRounds(t1)).map((r) => r.id)).not.toContain(r2.id);
    expect((await db.listRounds(t2)).map((r) => r.id)).toEqual([r2.id]);
    expect(await db.getRoundByNumber(t1, 2)).toMatchObject({ id: r1.id });
    expect(await db.getRoundByNumber(t2, 1)).toMatchObject({ id: r2.id });
    expect(await db.getRoundByNumber(t2, 2)).toBeNull();
  });

  it("allows the same player name in different tournaments", async () => {
    const { db } = await reload();
    const t1 = await createTournament(db, "One");
    const t2 = await createTournament(db, "Two");
    const a = await db.addPlayer(t1, "Same Name", 1200, "manual");
    const b = await db.addPlayer(t2, "Same Name", 1300, "fide");
    expect(a.id).not.toBe(b.id);
    await expect(db.addPlayer(t1, "Same Name", 1200, "manual")).rejects.toThrow();
  });
});

describe("auth sessions", () => {
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
