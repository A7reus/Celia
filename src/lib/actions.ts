"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { randomUUID } from "node:crypto";
import {
  addPlayer,
  allGames,
  createRound,
  createTournament,
  deleteAdmin,
  deletePlayer,
  deleteRound,
  deleteTournament,
  getAdminById,
  getAdminByUsername,
  getPlayer,
  getRound,
  getTournament,
  listPlayers,
  listRounds,
  listPairings,
  listTournaments,
  nextRoundNumber,
  playerHasGames,
  resetTournament,
  replacePairings,
  setPairingResult,
  setPlayerActive,
  setRoundStatus,
  setTournamentAdmin,
  setTournamentStatus,
  updateAdminPassword,
  updatePlayer,
  updateTournament,
  updateTournamentSettings,
  countSuperAdmins,
  createAdmin,
  wipeAllData
} from "./db";
import {
  clearAdminSession,
  clearLoginFailures,
  currentAdmin,
  getClientIp,
  hashPassword,
  loginLockout,
  recordLoginFailure,
  requireAdmin,
  requireSuperAdmin,
  setAdminSession,
  verifyPassword
} from "./auth";
import { pairRound, validatePlan } from "./pairing";
import { computeStandings } from "./scoring";
import type {
  GameResult,
  PairingPlan,
  RatingType,
  SimulationResult,
  Tournament,
  TournamentStatus,
  TournamentType
} from "@/types";

function revalidateAll(slug: string) {
  revalidatePath("/");
  revalidatePath(`/${slug}`);
  revalidatePath(`/${slug}/standings`);
  revalidatePath(`/${slug}/pairings`);
  revalidatePath(`/${slug}/pairings/[round]`, "page");
  revalidatePath(`/${slug}/results`);
  revalidatePath(`/${slug}/players/[id]`, "page");
  revalidatePath(`/admin`);
  revalidatePath(`/admin/${slug}`);
  revalidatePath(`/admin/${slug}/players`);
  revalidatePath(`/admin/${slug}/settings`);
  revalidatePath(`/admin/${slug}/rounds/[n]`, "page");
}

// ---------- access control ----------

async function tournamentAccess(formData: FormData): Promise<{ tournament: Tournament } | { error: string }> {
  const tournamentId = Number(formData.get("tournament_id"));
  if (!Number.isInteger(tournamentId)) return { error: "Invalid tournament" };
  const tournament = await getTournament(tournamentId);
  if (!tournament) return { error: "Tournament not found" };
  const admin = await currentAdmin();
  if (!admin) return { error: "Not signed in" };
  if (!admin.isSuper && tournament.adminId !== admin.id) return { error: "Not authorized" };
  return { tournament };
}

// ---------- auth ----------

export async function loginAction(
  prevState: { error?: string } | null,
  formData: FormData
): Promise<{ error?: string }> {
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const ip = await getClientIp();

  const allowlist = process.env.ADMIN_IP_ALLOWLIST;
  if (allowlist) {
    const allowed = allowlist
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (!ip || !allowed.includes(ip)) {
      return { error: "Admin access is restricted to allowed networks." };
    }
  }

  if (ip) {
    const { locked, retryAfterSec } = await loginLockout(ip);
    if (locked) {
      const minutes = Math.ceil(retryAfterSec / 60);
      return { error: `Too many failed attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.` };
    }
  }

  const admin = await getAdminByUsername(username);
  if (!admin || !(await verifyPassword(password, admin.passwordHash))) {
    if (ip) await recordLoginFailure(ip);
    return { error: "Invalid username or password" };
  }
  if (ip) await clearLoginFailures(ip);
  await setAdminSession(admin.id, admin.isSuper);
  redirect("/admin");
}

export async function logoutAction(): Promise<void> {
  await clearAdminSession();
  redirect("/admin/login");
}

// ---------- super admin: accounts & tournaments ----------

export async function createAdminAction(formData: FormData): Promise<{ error?: string }> {
  await requireSuperAdmin();
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const isSuper = formData.get("is_super") === "1";
  if (!/^[a-z0-9_.-]{2,30}$/i.test(username)) {
    return { error: "Username must be 2-30 characters: letters, digits, dot, dash, underscore" };
  }
  if (password.length < 4) return { error: "Password must be at least 4 characters" };
  if (await getAdminByUsername(username)) return { error: "That username is already taken" };
  try {
    await createAdmin(username, hashPassword(password), isSuper);
  } catch {
    return { error: "That username is already taken" };
  }
  revalidatePath("/admin");
  return {};
}

export async function deleteAdminAction(formData: FormData): Promise<{ error?: string }> {
  const admin = await requireSuperAdmin();
  const id = Number(formData.get("admin_id"));
  if (!Number.isInteger(id)) return { error: "Invalid account" };
  if (id === admin.id) return { error: "You cannot delete your own account" };
  const target = await getAdminById(id);
  if (!target) return { error: "Account not found" };
  if (target.isSuper && (await countSuperAdmins()) <= 1) {
    return { error: "Cannot delete the last super admin" };
  }
  await deleteAdmin(id);
  await setTournamentAdminToNullForAdmin(id);
  revalidatePath("/admin");
  return {};
}

async function setTournamentAdminToNullForAdmin(adminId: number): Promise<void> {
  for (const t of await listTournaments()) {
    if (t.adminId === adminId) await setTournamentAdmin(t.id, null);
  }
}

export async function resetAdminPasswordAction(formData: FormData): Promise<{ error?: string }> {
  await requireSuperAdmin();
  const id = Number(formData.get("admin_id"));
  const password = String(formData.get("password") ?? "");
  if (!Number.isInteger(id)) return { error: "Invalid account" };
  if (password.length < 4) return { error: "Password must be at least 4 characters" };
  if (!(await getAdminById(id))) return { error: "Account not found" };
  await updateAdminPassword(id, hashPassword(password));
  return {};
}

export async function createTournamentAction(formData: FormData): Promise<{ error?: string }> {
  await requireSuperAdmin();
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const type = String(formData.get("type") ?? "other") as TournamentType;
  const timeControl = String(formData.get("time_control") ?? "").trim() || "10+5";
  const roundsCount = Number(formData.get("rounds_count"));
  const defaultRating = Number(formData.get("default_rating"));
  const adminIdRaw = formData.get("admin_id");
  const adminId = adminIdRaw && adminIdRaw !== "" ? Number(adminIdRaw) : null;
  if (!name) return { error: "Tournament name is required" };
  if (description && description.length > 300) return { error: "Description must be 300 characters or fewer" };
  if (!["intradept", "interdept", "other"].includes(type)) return { error: "Invalid tournament type" };
  if (!Number.isFinite(roundsCount) || roundsCount < 1 || roundsCount > 20) {
    return { error: "Rounds must be between 1 and 20" };
  }
  if (!Number.isFinite(defaultRating) || defaultRating < 0) return { error: "Invalid default rating" };
  if (adminId != null && !Number.isInteger(adminId)) return { error: "Invalid admin" };
  if (adminId != null && !(await getAdminById(adminId))) return { error: "Account not found" };
  await createTournament({
    name,
    slug: randomUUID(),
    description,
    type,
    timeControl,
    roundsCount: Math.round(roundsCount),
    defaultRating: Math.round(defaultRating),
    adminId
  });
  revalidatePath("/admin");
  return {};
}

export async function updateTournamentAction(formData: FormData): Promise<{ error?: string }> {
  await requireSuperAdmin();
  const tournamentId = Number(formData.get("tournament_id"));
  if (!Number.isInteger(tournamentId)) return { error: "Invalid tournament" };
  const tournament = await getTournament(tournamentId);
  if (!tournament) return { error: "Tournament not found" };
  const name = String(formData.get("name") ?? "").trim();
  const descriptionRaw = formData.get("description");
  const type = String(formData.get("type") ?? "") as TournamentType;
  const patch: { name?: string; type?: TournamentType; description?: string | null } = {};
  if (name && name !== tournament.name) {
    patch.name = name;
  }
  if (descriptionRaw !== null && descriptionRaw !== undefined && descriptionRaw !== tournament.description) {
    const description = String(descriptionRaw).trim() || null;
    if (description && description.length > 300) return { error: "Description must be 300 characters or fewer" };
    patch.description = description;
  }
  if (type && ["intradept", "interdept", "other"].includes(type) && type !== tournament.type) {
    patch.type = type;
  }
  await updateTournament(tournamentId, patch);
  revalidateAll(tournament.slug);
  revalidatePath(`/admin/${tournament.slug}`);
  return {};
}

export async function setTournamentAdminAction(formData: FormData): Promise<{ error?: string }> {
  await requireSuperAdmin();
  const tournamentId = Number(formData.get("tournament_id"));
  const adminIdRaw = formData.get("admin_id");
  const adminId = adminIdRaw && adminIdRaw !== "" ? Number(adminIdRaw) : null;
  if (!Number.isInteger(tournamentId)) return { error: "Invalid tournament" };
  const tournament = await getTournament(tournamentId);
  if (!tournament) return { error: "Tournament not found" };
  if (adminId != null && !(await getAdminById(adminId))) return { error: "Account not found" };
  await setTournamentAdmin(tournamentId, adminId);
  revalidatePath("/admin");
  revalidatePath(`/admin/${tournament.slug}`);
  return {};
}

export async function setTournamentStatusAction(formData: FormData): Promise<{ error?: string }> {
  await requireSuperAdmin();
  const tournamentId = Number(formData.get("tournament_id"));
  const status = String(formData.get("status") ?? "") as TournamentStatus;
  if (!Number.isInteger(tournamentId)) return { error: "Invalid tournament" };
  const tournament = await getTournament(tournamentId);
  if (!tournament) return { error: "Tournament not found" };
  if (!["active", "archived"].includes(status)) return { error: "Invalid status" };
  await setTournamentStatus(tournamentId, status);
  revalidateAll(tournament.slug);
  return {};
}

export async function deleteTournamentAction(formData: FormData): Promise<{ error?: string }> {
  await requireSuperAdmin();
  const tournamentId = Number(formData.get("tournament_id"));
  if (!Number.isInteger(tournamentId)) return { error: "Invalid tournament" };
  const tournament = await getTournament(tournamentId);
  if (!tournament) return { error: "Tournament not found" };
  await deleteTournament(tournamentId);
  revalidatePath("/admin");
  return {};
}

export async function wipeAllAction(): Promise<{ error?: string }> {
  await requireSuperAdmin();
  await wipeAllData();
  revalidatePath("/admin");
  revalidatePath("/");
  return {};
}

// ---------- players ----------

export async function addPlayerAction(formData: FormData): Promise<{ error?: string }> {
  const access = await tournamentAccess(formData);
  if ("error" in access) return access;
  const { tournament } = access;
  const name = String(formData.get("name") ?? "").trim();
  const rating = Number(formData.get("rating") ?? tournament.defaultRating);
  const ratingType = String(formData.get("rating_type") ?? "manual") as RatingType;
  if (!name) return { error: "Name is required" };
  try {
    await addPlayer(
      tournament.id,
      name,
      Number.isFinite(rating) ? rating : tournament.defaultRating,
      ratingType === "fide" ? "fide" : "manual"
    );
  } catch {
    return { error: "A player with that name already exists" };
  }
  revalidateAll(tournament.slug);
  return {};
}

export async function updatePlayerAction(formData: FormData): Promise<{ error?: string }> {
  const access = await tournamentAccess(formData);
  if ("error" in access) return access;
  const { tournament } = access;
  const id = Number(formData.get("id"));
  const name = String(formData.get("name") ?? "").trim();
  const rating = Number(formData.get("rating") ?? tournament.defaultRating);
  const ratingType = String(formData.get("rating_type") ?? "manual") as RatingType;
  if (!name || !Number.isInteger(id)) return { error: "Invalid input" };
  try {
    await updatePlayer(
      tournament.id,
      id,
      name,
      Number.isFinite(rating) ? rating : tournament.defaultRating,
      ratingType === "fide" ? "fide" : "manual"
    );
  } catch {
    return { error: "A player with that name already exists" };
  }
  revalidateAll(tournament.slug);
  return {};
}

export async function togglePlayerActiveAction(formData: FormData): Promise<{ error?: string }> {
  const access = await tournamentAccess(formData);
  if ("error" in access) return access;
  const { tournament } = access;
  const id = Number(formData.get("id"));
  const active = formData.get("active") === "1";
  if (!Number.isInteger(id)) return { error: "Invalid input" };
  await setPlayerActive(tournament.id, id, !active);
  revalidateAll(tournament.slug);
  return {};
}

export async function deletePlayerAction(formData: FormData): Promise<{ error?: string }> {
  const access = await tournamentAccess(formData);
  if ("error" in access) return access;
  const { tournament } = access;
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id)) return { error: "Invalid input" };
  const player = await getPlayer(tournament.id, id);
  if (!player) return { error: "Player not found" };
  if (await playerHasGames(tournament.id, id)) {
    return { error: "This player has already played in a round. Deactivate them instead of deleting." };
  }
  await deletePlayer(tournament.id, id);
  revalidateAll(tournament.slug);
  return {};
}

// ---------- rounds ----------

export async function generateRoundAction(tournamentId: number): Promise<{ error?: string }> {
  const admin = await requireAdmin();
  const tournament = await getTournament(tournamentId);
  if (!tournament) return { error: "Tournament not found" };
  if (!admin.isSuper && tournament.adminId !== admin.id) return { error: "Not authorized" };
  const rounds = await listRounds(tournament.id);
  if (rounds.some((r) => r.status === "draft" || r.status === "published")) {
    return { error: "There is already a pending round. Complete or delete it first." };
  }
  const players = await listPlayers(tournament.id);
  const active = players.filter((p) => p.active === 1);
  if (active.length < 2) {
    return { error: "At least 2 active players are required" };
  }
  const roundNumber = await nextRoundNumber(tournament.id);
  if (roundNumber > tournament.roundsCount) {
    return { error: `Only ${tournament.roundsCount} rounds are scheduled` };
  }
  try {
    const games = await allGames(tournament.id);
    const plan = pairRound(players, games);
    const round = await createRound(tournament.id, roundNumber);
    await replacePairings(
      round.id,
      plan.map((p) => ({
        board: p.board,
        whiteId: p.whiteId,
        blackId: p.blackId,
        isBye: p.isBye,
        byeForId: p.byeForId
      }))
    );
    validatePlan(plan, games, players);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to generate round" };
  }
  revalidateAll(tournament.slug);
  redirect(`/admin/${tournament.slug}/rounds/${roundNumber}`);
}

export async function regenerateRoundAction(formData: FormData): Promise<{ error?: string }> {
  const access = await tournamentAccess(formData);
  if ("error" in access) return access;
  const { tournament } = access;
  const roundId = Number(formData.get("round_id"));
  const round = await getRound(tournament.id, roundId);
  if (!round || round.status !== "draft") return { error: "Only draft rounds can be regenerated" };
  try {
    const players = await listPlayers(tournament.id);
    const games = await allGames(tournament.id);
    const plan = pairRound(players, games);
    await replacePairings(
      round.id,
      plan.map((p) => ({
        board: p.board,
        whiteId: p.whiteId,
        blackId: p.blackId,
        isBye: p.isBye,
        byeForId: p.byeForId
      }))
    );
    validatePlan(plan, games, players);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to regenerate round" };
  }
  revalidateAll(tournament.slug);
  redirect(`/admin/${tournament.slug}/rounds/${round.number}`);
}

export async function savePairingsAction(formData: FormData): Promise<{ error?: string }> {
  const access = await tournamentAccess(formData);
  if ("error" in access) return access;
  const { tournament } = access;
  const roundId = Number(formData.get("round_id"));
  const raw = String(formData.get("pairs") ?? "[]");
  const round = await getRound(tournament.id, roundId);
  if (!round || round.status !== "draft") return { error: "Only draft rounds can be edited" };
  let pairs: { whiteId: number | null; blackId: number | null; isBye: boolean; byeForId: number | null }[];
  try {
    pairs = JSON.parse(raw) as typeof pairs;
  } catch {
    return { error: "Invalid pairing data" };
  }
  const players = await listPlayers(tournament.id);
  const plan: PairingPlan[] = pairs.map((p, i) => ({ board: i + 1, ...p }));
  const warnings = validatePlan(plan, await allGames(tournament.id), players);
  if (
    warnings.some(
      (w) => w.includes("twice") || w.includes("themselves") || w.includes("missing") || w.includes("inactive")
    )
  ) {
    return { error: `Invalid pairings: ${warnings.join("; ")}` };
  }
  await replacePairings(
    round.id,
    pairs.map((p, i) => ({
      board: i + 1,
      whiteId: p.whiteId,
      blackId: p.blackId,
      isBye: p.isBye,
      byeForId: p.byeForId
    }))
  );
  revalidateAll(tournament.slug);
  return warnings.length > 0 ? { error: `Saved with warnings: ${warnings.join("; ")}` } : {};
}

export async function publishRoundAction(formData: FormData): Promise<{ error?: string }> {
  const access = await tournamentAccess(formData);
  if ("error" in access) return access;
  const { tournament } = access;
  const roundId = Number(formData.get("round_id"));
  const round = await getRound(tournament.id, roundId);
  if (!round || round.status !== "draft") return { error: "Only draft rounds can be published" };
  await setRoundStatus(tournament.id, roundId, "published");
  revalidateAll(tournament.slug);
  return {};
}

export async function saveResultsAction(formData: FormData): Promise<{ error?: string }> {
  const access = await tournamentAccess(formData);
  if ("error" in access) return access;
  const { tournament } = access;
  const roundId = Number(formData.get("round_id"));
  const round = await getRound(tournament.id, roundId);
  if (!round || round.status !== "published") return { error: "Round must be published to enter results" };
  const results = String(formData.get("results") ?? "{}");
  let parsed: Record<string, GameResult>;
  try {
    parsed = JSON.parse(results) as Record<string, GameResult>;
  } catch {
    return { error: "Invalid results data" };
  }
  const pairings = await listPairings(roundId);
  for (const pairing of pairings) {
    if (pairing.isBye) continue;
    const value = parsed[String(pairing.id)];
    if (value === undefined) continue;
    if (value === null) {
      await setPairingResult(pairing.id, null);
      continue;
    }
    if (!["1-0", "0-1", "1/2", "+", "-"].includes(value)) return { error: "Invalid result value" };
    await setPairingResult(pairing.id, value);
  }
  revalidateAll(tournament.slug);
  return {};
}

export async function completeRoundAction(formData: FormData): Promise<{ error?: string }> {
  const access = await tournamentAccess(formData);
  if ("error" in access) return access;
  const { tournament } = access;
  const roundId = Number(formData.get("round_id"));
  const round = await getRound(tournament.id, roundId);
  if (!round || round.status !== "published") return { error: "Round must be published" };
  const pairings = await listPairings(roundId);
  const pending = pairings.filter((p) => !p.isBye && p.result == null);
  if (pending.length > 0) {
    return { error: `${pending.length} result(s) still missing` };
  }
  await setRoundStatus(tournament.id, roundId, "completed");
  revalidateAll(tournament.slug);
  return {};
}

export async function reopenRoundAction(formData: FormData): Promise<{ error?: string }> {
  const access = await tournamentAccess(formData);
  if ("error" in access) return access;
  const { tournament } = access;
  const roundId = Number(formData.get("round_id"));
  const round = await getRound(tournament.id, roundId);
  if (!round || round.status !== "completed") return { error: "Only completed rounds can be reopened" };
  await setRoundStatus(tournament.id, roundId, "published");
  for (const r of await listRounds(tournament.id)) {
    if (r.number > round.number) {
      await deleteRound(tournament.id, r.id);
    }
  }
  revalidateAll(tournament.slug);
  return {};
}

export async function deleteRoundAction(formData: FormData): Promise<{ error?: string }> {
  const access = await tournamentAccess(formData);
  if ("error" in access) return access;
  const { tournament } = access;
  const roundId = Number(formData.get("round_id"));
  if (await getRound(tournament.id, roundId)) {
    await deleteRound(tournament.id, roundId);
  }
  revalidateAll(tournament.slug);
  redirect(`/admin/${tournament.slug}`);
}

export async function resetTournamentAction(tournamentId: number): Promise<{ error?: string }> {
  const admin = await requireAdmin();
  const tournament = await getTournament(tournamentId);
  if (!tournament) return { error: "Tournament not found" };
  if (!admin.isSuper && tournament.adminId !== admin.id) return { error: "Not authorized" };
  await resetTournament(tournament.id);
  revalidateAll(tournament.slug);
  redirect(`/admin/${tournament.slug}`);
}

// ---------- settings ----------

export async function updateSettingsAction(formData: FormData): Promise<{ error?: string }> {
  const access = await tournamentAccess(formData);
  if ("error" in access) return access;
  const { tournament } = access;
  const timeControl = String(formData.get("time_control") ?? "").trim();
  const roundsCount = Number(formData.get("rounds_count"));
  const defaultRating = Number(formData.get("default_rating"));
  if (!Number.isFinite(roundsCount) || roundsCount < 1 || roundsCount > 20) {
    return { error: "Rounds must be between 1 and 20" };
  }
  if (!Number.isFinite(defaultRating) || defaultRating < 0) return { error: "Invalid default rating" };
  await updateTournamentSettings(tournament.id, {
    timeControl: timeControl || "10+5",
    roundsCount: Math.round(roundsCount),
    defaultRating: Math.round(defaultRating)
  });
  revalidateAll(tournament.slug);
  return {};
}

export async function changePasswordAction(formData: FormData): Promise<{ error?: string }> {
  const admin = await requireAdmin();
  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("next") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (!(await verifyPassword(current, admin.passwordHash))) return { error: "Current password is incorrect" };
  if (next.length < 4) return { error: "New password must be at least 4 characters" };
  if (next !== confirm) return { error: "Passwords do not match" };
  await updateAdminPassword(admin.id, hashPassword(next));
  return {};
}

// ---------- simulation ----------

function simulateResult(whiteRating: number, blackRating: number, seed: number): GameResult {
  // Deterministic pseudo-random weighted by rating difference
  let x = (seed * 2654435761) % 4294967296;
  x = (x * 48271) % 2147483647;
  const r = x / 2147483647;
  const expected = 1 / (1 + Math.pow(10, (blackRating - whiteRating) / 400));
  if (r < expected - 0.12) return "1-0";
  if (r > expected + 0.12) return "0-1";
  return "1/2";
}

export async function simulateAction(tournamentId: number): Promise<SimulationResult> {
  const admin = await requireAdmin();
  const tournament = await getTournament(tournamentId);
  if (!tournament) throw new Error("Tournament not found");
  if (!admin.isSuper && tournament.adminId !== admin.id) throw new Error("Not authorized");
  const players = await listPlayers(tournament.id);
  let games = await allGames(tournament.id);
  const playedRounds = games.reduce((m, g) => Math.max(m, g.round), 0);
  const remaining = Math.max(0, tournament.roundsCount - playedRounds);
  let seed = 1;
  for (let r = 0; r < remaining; r++) {
    const plan = pairRound(players, games);
    const roundNumber = playedRounds + r + 1;
    for (const p of plan) {
      if (p.isBye) {
        games = [
          ...games,
          { round: roundNumber, whiteId: null, blackId: null, result: null, isBye: true, byeForId: p.byeForId }
        ];
        continue;
      }
      const white = players.find((p2) => p2.id === p.whiteId)!;
      const black = players.find((p2) => p2.id === p.blackId)!;
      const result = simulateResult(white.rating, black.rating, seed++);
      games = [
        ...games,
        { round: roundNumber, whiteId: p.whiteId, blackId: p.blackId, result, isBye: false, byeForId: null }
      ];
    }
  }
  const standings = computeStandings(players, games);
  return { standings, rounds: playedRounds + remaining };
}
