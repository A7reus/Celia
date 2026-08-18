import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

let tmp: string;

beforeAll(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "chess-limit-"));
  vi.stubEnv("TURSO_DATABASE_URL", "");
  vi.stubEnv("TURSO_AUTH_TOKEN", "");
  vi.stubEnv("CHESS_DATA_DIR", tmp);
});

afterAll(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("login rate limiting", () => {
  it("locks an IP after 5 failures and unlocks after clearing", async () => {
    const { loginLockout, recordLoginFailure, clearLoginFailures } = await import("../lib/auth");
    const { getDb } = await import("../lib/db");

    const ip = "203.0.113.7";
    await clearLoginFailures(ip);
    expect(await loginLockout(ip)).toEqual({ locked: false, retryAfterSec: 0 });

    for (let i = 0; i < 4; i++) {
      await recordLoginFailure(ip);
      expect((await loginLockout(ip)).locked).toBe(false);
    }
    await recordLoginFailure(ip);
    const after5 = await loginLockout(ip);
    expect(after5.locked).toBe(true);
    expect(after5.retryAfterSec).toBeGreaterThan(0);
    expect(after5.retryAfterSec).toBeLessThanOrEqual(5 * 60);

    // Lockout is enforced on subsequent requests and grows past the base window
    await recordLoginFailure(ip);
    const after6 = await loginLockout(ip);
    expect(after6.retryAfterSec).toBeGreaterThan(5 * 60);

    // A successful login clears the record
    await clearLoginFailures(ip);
    expect(await loginLockout(ip)).toEqual({ locked: false, retryAfterSec: 0 });
    const row = await getDb();
    expect(await row.get("SELECT * FROM login_limits WHERE ip = ?", [ip])).toBeUndefined();
  });

  it("resets a stale failure window after 15 minutes", async () => {
    const { loginLockout, recordLoginFailure } = await import("../lib/auth");
    const { getDb } = await import("../lib/db");

    const ip = "198.51.100.9";
    await recordLoginFailure(ip);
    const db = await getDb();
    await db.run("UPDATE login_limits SET first_failure = ? WHERE ip = ?", [Date.now() - 16 * 60_000, ip]);
    expect(await loginLockout(ip)).toEqual({ locked: false, retryAfterSec: 0 });
    expect(await db.get("SELECT * FROM login_limits WHERE ip = ?", [ip])).toBeUndefined();
  });
});
