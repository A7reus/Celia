"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  addPlayer,
  allGames,
  createRound,
  deletePlayer,
  deleteRound,
  getPlayer,
  getRound,
  getSettings,
  listPlayers,
  listRounds,
  listPairings,
  nextRoundNumber,
  playerHasGames,
  resetTournament,
  replacePairings,
  setPairingResult,
  setPlayerActive,
  setRoundStatus,
  setSetting,
  updatePlayer
} from "./db";
import {
  changeAdminPassword,
  clearAdminSession,
  clearLoginFailures,
  getClientIp,
  loginLockout,
  recordLoginFailure,
  requireAdmin,
  setAdminSession,
  verifyPassword
} from "./auth";
import { pairRound, validatePlan } from "./pairing";
import { computeStandings } from "./scoring";
import type { GameResult, PairingPlan, RatingType, StandingWithRank } from "@/types";

function revalidateAll() {
  for (const path of ["/", "/pairings", "/results", "/admin", "/admin/players", "/admin/settings"]) {
    revalidatePath(path);
  }
  revalidatePath("/admin/rounds/[n]", "page");
  revalidatePath("/players/[id]", "page");
}

// ---------- auth ----------

export async function loginAction(
  prevState: { error?: string } | null,
  formData: FormData
): Promise<{ error?: string }> {
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

  const settings = await getSettings();
  if (!(await verifyPassword(password, settings.adminPasswordHash))) {
    if (ip) await recordLoginFailure(ip);
    return { error: "Invalid password" };
  }
  if (ip) await clearLoginFailures(ip);
  await setAdminSession();
  redirect("/admin");
}

export async function logoutAction(): Promise<void> {
  await clearAdminSession();
  redirect("/admin/login");
}

// ---------- players ----------

export async function addPlayerAction(formData: FormData): Promise<{ error?: string }> {
  await requireAdmin();
  const name = String(formData.get("name") ?? "").trim();
  const rating = Number(formData.get("rating") ?? (await getSettings()).defaultRating);
  const ratingType = String(formData.get("rating_type") ?? "manual") as RatingType;
  if (!name) return { error: "Name is required" };
  try {
    await addPlayer(
      name,
      Number.isFinite(rating) ? rating : (await getSettings()).defaultRating,
      ratingType === "fide" ? "fide" : "manual"
    );
  } catch {
    return { error: "A player with that name already exists" };
  }
  revalidateAll();
  return {};
}

export async function updatePlayerAction(formData: FormData): Promise<{ error?: string }> {
  await requireAdmin();
  const id = Number(formData.get("id"));
  const name = String(formData.get("name") ?? "").trim();
  const rating = Number(formData.get("rating") ?? 1200);
  const ratingType = String(formData.get("rating_type") ?? "manual") as RatingType;
  if (!name || !Number.isFinite(id)) return { error: "Invalid input" };
  try {
    await updatePlayer(id, name, Number.isFinite(rating) ? rating : 1200, ratingType === "fide" ? "fide" : "manual");
  } catch {
    return { error: "A player with that name already exists" };
  }
  revalidateAll();
  return {};
}

export async function togglePlayerActiveAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = Number(formData.get("id"));
  const active = formData.get("active") === "1";
  await setPlayerActive(id, !active);
  revalidateAll();
}

export async function deletePlayerAction(formData: FormData): Promise<{ error?: string }> {
  await requireAdmin();
  const id = Number(formData.get("id"));
  const player = await getPlayer(id);
  if (!player) return { error: "Player not found" };
  if (await playerHasGames(id)) {
    return { error: "This player has already played in a round. Deactivate them instead of deleting." };
  }
  await deletePlayer(id);
  revalidateAll();
  return {};
}

// ---------- rounds ----------

export async function generateRoundAction(): Promise<{ error?: string }> {
  await requireAdmin();
  const rounds = await listRounds();
  if (rounds.some((r) => r.status === "draft" || r.status === "published")) {
    return { error: "There is already a pending round. Complete or delete it first." };
  }
  const players = await listPlayers();
  const active = players.filter((p) => p.active === 1);
  if (active.length < 2) {
    return { error: "At least 2 active players are required" };
  }
  const roundNumber = await nextRoundNumber();
  if (roundNumber > (await getSettings()).roundsCount) {
    return { error: `Only ${(await getSettings()).roundsCount} rounds are scheduled` };
  }
  try {
    const games = await allGames();
    const plan = pairRound(players, games);
    const round = await createRound(roundNumber);
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
  revalidateAll();
  redirect(`/admin/rounds/${roundNumber}`);
}

export async function regenerateRoundAction(formData: FormData): Promise<{ error?: string }> {
  await requireAdmin();
  const roundId = Number(formData.get("round_id"));
  const round = await getRound(roundId);
  if (!round || round.status !== "draft") return { error: "Only draft rounds can be regenerated" };
  try {
    const players = await listPlayers();
    const games = await allGames();
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
  revalidateAll();
  redirect(`/admin/rounds/${round.number}`);
}

export async function savePairingsAction(formData: FormData): Promise<{ error?: string }> {
  await requireAdmin();
  const roundId = Number(formData.get("round_id"));
  const raw = String(formData.get("pairs") ?? "[]");
  const round = await getRound(roundId);
  if (!round || round.status !== "draft") return { error: "Only draft rounds can be edited" };
  let pairs: { whiteId: number | null; blackId: number | null; isBye: boolean; byeForId: number | null }[];
  try {
    pairs = JSON.parse(raw) as typeof pairs;
  } catch {
    return { error: "Invalid pairing data" };
  }
  const players = await listPlayers();
  const plan: PairingPlan[] = pairs.map((p, i) => ({ board: i + 1, ...p }));
  const warnings = validatePlan(plan, await allGames(), players);
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
  revalidateAll();
  return warnings.length > 0 ? { error: `Saved with warnings: ${warnings.join("; ")}` } : {};
}

export async function publishRoundAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const roundId = Number(formData.get("round_id"));
  const round = await getRound(roundId);
  if (!round || round.status !== "draft") return;
  await setRoundStatus(roundId, "published");
  revalidateAll();
}

export async function saveResultsAction(formData: FormData): Promise<{ error?: string }> {
  await requireAdmin();
  const roundId = Number(formData.get("round_id"));
  const round = await getRound(roundId);
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
  revalidateAll();
  return {};
}

export async function completeRoundAction(formData: FormData): Promise<{ error?: string }> {
  await requireAdmin();
  const roundId = Number(formData.get("round_id"));
  const round = await getRound(roundId);
  if (!round || round.status !== "published") return { error: "Round must be published" };
  const pairings = await listPairings(roundId);
  const pending = pairings.filter((p) => !p.isBye && p.result == null);
  if (pending.length > 0) {
    return { error: `${pending.length} result(s) still missing` };
  }
  await setRoundStatus(roundId, "completed");
  revalidateAll();
  return {};
}

export async function reopenRoundAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const roundId = Number(formData.get("round_id"));
  const round = await getRound(roundId);
  if (!round || round.status !== "completed") return;
  await setRoundStatus(roundId, "published");
  for (const r of await listRounds()) {
    if (r.number > round.number) {
      await deleteRound(r.id);
    }
  }
  revalidateAll();
}

export async function deleteRoundAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const roundId = Number(formData.get("round_id"));
  if (await getRound(roundId)) {
    await deleteRound(roundId);
  }
  revalidateAll();
  redirect("/admin");
}

export async function resetTournamentAction(): Promise<void> {
  await requireAdmin();
  await resetTournament();
  revalidateAll();
  redirect("/");
}

// ---------- settings ----------

export async function updateSettingsAction(formData: FormData): Promise<{ error?: string }> {
  await requireAdmin();
  const name = String(formData.get("tournament_name") ?? "").trim();
  const timeControl = String(formData.get("time_control") ?? "").trim();
  const roundsCount = Number(formData.get("rounds_count"));
  const defaultRating = Number(formData.get("default_rating"));
  if (!name) return { error: "Tournament name is required" };
  if (!Number.isFinite(roundsCount) || roundsCount < 1 || roundsCount > 20) {
    return { error: "Rounds must be between 1 and 20" };
  }
  if (!Number.isFinite(defaultRating) || defaultRating < 0) return { error: "Invalid default rating" };
  await setSetting("tournament_name", name);
  await setSetting("time_control", timeControl || "10+5");
  await setSetting("rounds_count", String(Math.round(roundsCount)));
  await setSetting("default_rating", String(Math.round(defaultRating)));
  revalidateAll();
  return {};
}

export async function changePasswordAction(formData: FormData): Promise<{ error?: string }> {
  await requireAdmin();
  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("next") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  const settings = await getSettings();
  if (!(await verifyPassword(current, settings.adminPasswordHash))) return { error: "Current password is incorrect" };
  if (next.length < 4) return { error: "New password must be at least 4 characters" };
  if (next !== confirm) return { error: "Passwords do not match" };
  await changeAdminPassword(next);
  revalidateAll();
  return {};
}

// ---------- simulation ----------

export type SimulationResult = {
  standings: StandingWithRank[];
  rounds: number;
};

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

export async function simulateAction(): Promise<SimulationResult> {
  await requireAdmin();
  const settings = await getSettings();
  let players = await listPlayers();
  let games = await allGames();
  const playedRounds = games.reduce((m, g) => Math.max(m, g.round), 0);
  const remaining = Math.max(0, settings.roundsCount - playedRounds);
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
