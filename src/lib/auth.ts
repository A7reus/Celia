import { createHmac, scryptSync, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAdminById, getDb, getSessionSecret, getTournament } from "./db";
import type { Admin } from "@/types";

const SESSION_COOKIE = "chess_admin_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

const MAX_FAILURES = 5;
const WINDOW_MS = 15 * 60_000;
const BASE_LOCKOUT_MS = 5 * 60_000;
const MAX_LOCKOUT_MS = 60 * 60_000;

export type SessionPayload = {
  v: 2;
  uid: number;
  isSuper: boolean;
  exp: number;
};

export async function getClientIp(): Promise<string | null> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return h.get("x-real-ip");
}

export async function loginLockout(ip: string): Promise<{ locked: boolean; retryAfterSec: number }> {
  const db = await getDb();
  await db.run("DELETE FROM login_limits WHERE locked_until > 0 AND locked_until <= ?", [Date.now()]);
  const row = await db.get("SELECT failures, first_failure, locked_until FROM login_limits WHERE ip = ?", [ip]);
  if (!row) return { locked: false, retryAfterSec: 0 };
  const lockedUntil = Number(row.locked_until);
  if (lockedUntil > Date.now()) {
    return { locked: true, retryAfterSec: Math.ceil((lockedUntil - Date.now()) / 1000) };
  }
  if (Date.now() - Number(row.first_failure) > WINDOW_MS) {
    await db.run("DELETE FROM login_limits WHERE ip = ?", [ip]);
  }
  return { locked: false, retryAfterSec: 0 };
}

export async function recordLoginFailure(ip: string): Promise<void> {
  const db = await getDb();
  const row = await db.get("SELECT failures, first_failure FROM login_limits WHERE ip = ?", [ip]);
  const failures = Number(row?.failures ?? 0) + 1;
  const firstFailure = Number(row?.first_failure ?? Date.now());
  const lockoutMs = Math.min(BASE_LOCKOUT_MS * 2 ** Math.max(failures - MAX_FAILURES, 0), MAX_LOCKOUT_MS);
  const lockedUntil = failures >= MAX_FAILURES ? Date.now() + lockoutMs : 0;
  await db.run(
    `INSERT INTO login_limits (ip, failures, first_failure, locked_until)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(ip) DO UPDATE SET failures = excluded.failures, locked_until = excluded.locked_until`,
    [ip, failures, firstFailure, lockedUntil]
  );
}

export async function clearLoginFailures(ip: string): Promise<void> {
  const db = await getDb();
  await db.run("DELETE FROM login_limits WHERE ip = ?", [ip]);
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  if (!stored.startsWith("scrypt$")) return false;
  const [, salt, hash] = stored.split("$");
  if (!salt || !hash) return false;
  const candidate = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function createSessionToken(secret: string, adminId: number, isSuper: boolean): string {
  const payload = Buffer.from(
    JSON.stringify({
      v: 2,
      uid: adminId,
      isSuper,
      exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS
    } satisfies SessionPayload)
  ).toString("base64url");
  return `${payload}.${sign(payload, secret)}`;
}

export function verifySessionToken(token: string | undefined, secret: string): SessionPayload | null {
  if (!token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = sign(payload, secret);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString()) as Partial<SessionPayload>;
    if (
      data.v !== 2 ||
      typeof data.uid !== "number" ||
      typeof data.isSuper !== "boolean" ||
      typeof data.exp !== "number" ||
      data.exp < Math.floor(Date.now() / 1000)
    ) {
      return null;
    }
    return { v: 2, uid: data.uid, isSuper: data.isSuper, exp: data.exp };
  } catch {
    return null;
  }
}

export async function currentAdmin(): Promise<Admin | null> {
  const store = await cookies();
  const secret = await getSessionSecret();
  const payload = verifySessionToken(store.get(SESSION_COOKIE)?.value, secret);
  if (!payload) return null;
  const admin = await getAdminById(payload.uid);
  if (!admin || admin.isSuper !== payload.isSuper) return null;
  return admin;
}

export async function requireAdmin(): Promise<Admin> {
  const admin = await currentAdmin();
  if (!admin) redirect("/admin/login");
  return admin;
}

export async function requireSuperAdmin(): Promise<Admin> {
  const admin = await requireAdmin();
  if (!admin.isSuper) redirect("/admin");
  return admin;
}

export async function requireTournamentAccess(tournamentId: number): Promise<Admin> {
  const admin = await requireAdmin();
  if (admin.isSuper) return admin;
  const tournament = await getTournament(tournamentId);
  if (!tournament || tournament.adminId !== admin.id) redirect("/admin");
  return admin;
}

export async function setAdminSession(adminId: number, isSuper: boolean): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, createSessionToken(await getSessionSecret(), adminId, isSuper), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS
  });
}

export async function clearAdminSession(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}
