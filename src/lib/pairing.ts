import { computeStandings } from "./scoring";
import type { Game, PairingPlan, Player, ColorState, PairGroupResult, PairSearchOptions } from "@/types";

const INF = 100_000;
const REPEAT_PENALTY = 10;
// Small pools are searched exhaustively; large ones get a best-effort budget,
// since a valid pairing is what matters when brackets merge.
const searchBudget = (n: number) => (n <= 16 ? 300_000 : 10_000);

function colorState(playerId: number, games: Game[]): ColorState {
  let diff = 0;
  const lastColors: ("w" | "b")[] = [];
  for (const g of games) {
    if (g.isBye || g.whiteId == null || g.blackId == null) continue;
    if (g.whiteId === playerId) {
      diff += 1;
      lastColors.push("w");
    } else if (g.blackId === playerId) {
      diff -= 1;
      lastColors.push("b");
    }
  }
  return { diff, lastColors };
}

function colorPenalty(state: ColorState, color: "w" | "b", strict: boolean): { penalty: number; ok: boolean } {
  const newDiff = state.diff + (color === "w" ? 1 : -1);
  if (strict && Math.abs(newDiff) > 2) return { penalty: INF, ok: false };
  const last = state.lastColors[state.lastColors.length - 1];
  let streak = 1;
  if (last === color) {
    for (let i = state.lastColors.length - 1; i >= 0 && state.lastColors[i] === color; i--) {
      streak++;
    }
  }
  if (strict && streak >= 3) return { penalty: INF, ok: false };
  const due: "w" | "b" = state.diff > 0 ? "b" : state.diff < 0 ? "w" : last === "w" ? "b" : "w";
  let penalty = (color === due ? 0 : 1) + (Math.abs(newDiff) === 2 ? 2 : 0);
  if (!strict) {
    penalty += Math.max(0, Math.abs(newDiff) - 2) * 1000;
    if (streak >= 3) penalty += 1000;
  }
  return { penalty, ok: true };
}

function playedBefore(a: number, b: number, games: Game[]): boolean {
  return games.some((g) => !g.isBye && ((g.whiteId === a && g.blackId === b) || (g.whiteId === b && g.blackId === a)));
}

function bestOrientation(
  a: number,
  b: number,
  colorStates: Map<number, ColorState>,
  strictColors: boolean
): { whiteId: number; blackId: number; penalty: number; ok: boolean } {
  const ca = colorStates.get(a)!;
  const cb = colorStates.get(b)!;
  const aw = colorPenalty(ca, "w", strictColors);
  const ab = colorPenalty(ca, "b", strictColors);
  const bw = colorPenalty(cb, "w", strictColors);
  const bb = colorPenalty(cb, "b", strictColors);

  const opt1 = aw.penalty + bb.penalty;
  const opt2 = ab.penalty + bw.penalty;
  const ok1 = aw.ok && bb.ok;
  const ok2 = ab.ok && bw.ok;

  if (!ok1 && !ok2) return { whiteId: a, blackId: b, penalty: INF, ok: false };
  if (ok1 && !ok2) return { whiteId: a, blackId: b, penalty: opt1, ok: true };
  if (!ok1 && ok2) return { whiteId: b, blackId: a, penalty: opt2, ok: true };
  if (opt1 <= opt2) return { whiteId: a, blackId: b, penalty: opt1, ok: true };
  return { whiteId: b, blackId: a, penalty: opt2, ok: true };
}

function pairGroup(
  players: number[],
  games: Game[],
  colorStates: Map<number, ColorState>,
  options: PairSearchOptions,
  maxIterations: number
): PairGroupResult | null {
  const pool = [...players];

  if (pool.length % 2 === 1) {
    // Try floaters from lowest rank first, then others, until a search succeeds
    const floaterCandidates = [pool[pool.length - 1]!, ...pool.slice(0, -1)];
    for (const floater of floaterCandidates) {
      const rest = pool.filter((p) => p !== floater);
      const res = searchEven(rest, games, colorStates, options, maxIterations);
      if (res)
        return { pairs: res.pairs, floater, allowRepeats: options.allowRepeats, colorRelaxed: !options.strictColors };
    }
    return null;
  }
  const res = searchEven(pool, games, colorStates, options, maxIterations);
  if (!res) return null;
  return { pairs: res.pairs, floater: null, allowRepeats: options.allowRepeats, colorRelaxed: !options.strictColors };
}

function searchEven(
  pool: number[],
  games: Game[],
  colorStates: Map<number, ColorState>,
  options: PairSearchOptions,
  maxIterations: number
): { pairs: { whiteId: number; blackId: number; penalty: number }[] } | null {
  const n = pool.length;
  const half = n / 2;
  const holder: { best: { pairs: { whiteId: number; blackId: number; penalty: number }[]; cost: number } | null } = {
    best: null
  };
  let iterations = 0;

  const used = new Set<number>();
  const pairs: { whiteId: number; blackId: number; penalty: number }[] = [];

  function partnerPenalty(first: number, second: number): { penalty: number; ok: boolean } {
    const repeated = playedBefore(first, second, games);
    if (!options.allowRepeats && repeated) return { penalty: INF, ok: false };
    const orient = bestOrientation(first, second, colorStates, options.strictColors);
    if (!orient.ok) return { penalty: INF, ok: false };
    // Minimise repeats first (FIDE B.4), then colour penalties (B.6-B.8).
    return { penalty: orient.penalty + (options.allowRepeats && repeated ? REPEAT_PENALTY : 0), ok: true };
  }

  function rec(): boolean {
    iterations++;
    if (iterations > maxIterations) return false;
    if (pairs.length === half) {
      const cost = pairs.reduce((s, p) => s + p.penalty, 0);
      if (!holder.best || cost < holder.best.cost) {
        holder.best = { pairs: [...pairs], cost };
        if (cost === 0) return true;
      }
      return false;
    }
    // Most-constrained-first: pick the unused player with the fewest viable partners
    const unused = pool.filter((p) => !used.has(p));
    let first = unused[0]!;
    let firstIdx = pool.indexOf(first);
    let fewest = Infinity;
    for (const p of unused) {
      let viable = 0;
      for (const q of unused) {
        if (q === p) continue;
        if (partnerPenalty(p, q).ok) viable++;
      }
      if (viable < fewest) {
        fewest = viable;
        first = p;
        firstIdx = pool.indexOf(p);
      }
    }
    used.add(first);
    const mirror = (firstIdx + half) % n;
    const candidates = pool
      .map((p, i) => ({ p, i }))
      .filter(({ p }) => !used.has(p))
      .sort((x, y) => {
        const distX = Math.min((x.i - mirror + n) % n, (mirror - x.i + n) % n);
        const distY = Math.min((y.i - mirror + n) % n, (mirror - y.i + n) % n);
        return distX - distY;
      });
    for (const { p: second } of candidates) {
      const check = partnerPenalty(first, second);
      if (!check.ok) continue;
      const oriented = orientPair(first, second, colorStates, options.strictColors);
      if (options.allowRepeats && playedBefore(first, second, games)) oriented.penalty += REPEAT_PENALTY;
      used.add(second);
      pairs.push(oriented);
      if (rec()) return true;
      pairs.pop();
      used.delete(second);
    }
    used.delete(first);
    return false;
  }

  rec();
  if (!holder.best) return null;
  return { pairs: holder.best.pairs };
}

function orientPair(
  a: number,
  b: number,
  colorStates: Map<number, ColorState>,
  strictColors: boolean
): { whiteId: number; blackId: number; penalty: number } {
  const orient = bestOrientation(a, b, colorStates, strictColors);
  if (!orient.ok) return { whiteId: a, blackId: b, penalty: INF };
  return { whiteId: orient.whiteId, blackId: orient.blackId, penalty: orient.penalty };
}

/**
 * Pair a Swiss round for the given players, given all previously completed games.
 * Returns pairings ordered by board, or throws if pairing is impossible.
 */
export function pairRound(players: Player[], games: Game[]): PairingPlan[] {
  const active = players.filter((p) => p.active === 1);
  if (active.length < 2) {
    return active.map((p, i) => ({
      board: i + 1,
      whiteId: null,
      blackId: null,
      isBye: true,
      byeForId: p.id
    }));
  }

  const standings = computeStandings(active, games);
  const rankById = new Map(standings.map((s, i) => [s.playerId, i]));
  const ordered = active.slice().sort((a, b) => rankById.get(a.id)! - rankById.get(b.id)!);

  // Bye: lowest-ranked player without a bye yet
  const byeFor: number | null = ordered.length % 2 === 1 ? pickBye(ordered, games) : null;
  const toPair = ordered.filter((p) => p.id !== byeFor);

  // Split into score groups
  const groups: number[][] = [];
  let currentScore: number | null = null;
  let currentGroup: number[] = [];
  const scoreById = new Map(standings.map((s) => [s.playerId, s.score]));
  for (const p of toPair) {
    const score = scoreById.get(p.id)!;
    if (currentScore !== score) {
      if (currentGroup.length > 0) groups.push(currentGroup);
      currentGroup = [];
      currentScore = score;
    }
    currentGroup.push(p.id);
  }
  if (currentGroup.length > 0) groups.push(currentGroup);

  const colorStates = new Map<number, ColorState>();
  for (const p of active) {
    colorStates.set(p.id, colorState(p.id, games));
  }

  const plans: PairingPlan[] = [];
  let floater: number | null = null;

  const tryStrict = (p: number[]) =>
    pairGroup(p, games, colorStates, { allowRepeats: false, strictColors: true }, searchBudget(p.length));

  // Pre-merge bottom-up: brackets that cannot pair on their own with strict
  // colors (or would strand a floater) merge into the bracket above.
  for (let i = groups.length - 1; i > 0; i--) {
    const g = groups[i]!;
    if (g.length === 0) continue;
    const sorted = [...g].sort((a, b) => rankById.get(a)! - rankById.get(b)!);
    const standalone = tryStrict(sorted);
    const oddLast = i === groups.length - 1 && g.length % 2 === 1;
    if (!standalone || oddLast) {
      groups[i - 1] = [...groups[i - 1]!, ...g];
      groups[i] = [];
    }
  }

  for (let gi = 0; gi < groups.length; gi++) {
    const group = groups[gi]!;
    if (group.length === 0) continue;
    const pool: number[] = floater != null ? [floater, ...group] : group;
    const sortedPool: number[] = [...pool].sort((a, b) => rankById.get(a)! - rankById.get(b)!);
    const withRepeatsStrict = (p: number[]) =>
      pairGroup(p, games, colorStates, { allowRepeats: true, strictColors: true }, searchBudget(p.length));
    const withRepeatsRelaxed = (p: number[]) =>
      pairGroup(p, games, colorStates, { allowRepeats: true, strictColors: false }, searchBudget(p.length));

    let result = tryStrict(sortedPool);
    if (!result) {
      // Deadlock: merge this bracket with the following ones, trying the full
      // fallback ladder on each merged pool. Keep merging while the best
      // pairing so far still contains repeats (a larger pool may avoid them).
      let merged: number[] = [...sortedPool];
      let ng = gi + 1;
      let lastOk = -1;
      while (ng < groups.length) {
        merged = [...merged, ...groups[ng]!];
        const mergedSorted: number[] = [...merged].sort((a, b) => rankById.get(a)! - rankById.get(b)!);
        const candidate: PairGroupResult | null =
          tryStrict(mergedSorted) ?? withRepeatsStrict(mergedSorted) ?? withRepeatsRelaxed(mergedSorted);
        if (candidate) {
          result = candidate;
          lastOk = ng;
          if (result.pairs.every((p) => !playedBefore(p.whiteId, p.blackId, games))) break;
        }
        ng++;
      }
      if (result) {
        for (let k = gi + 1; k <= lastOk; k++) groups[k] = [];
      }
    }
    if (!result) {
      result = withRepeatsStrict(sortedPool);
    }
    if (!result) {
      result = withRepeatsRelaxed(sortedPool);
    }
    if (!result) {
      throw new Error("Unable to pair round");
    }
    for (const p of result.pairs) {
      let warning: string | undefined;
      if (result.allowRepeats && playedBefore(p.whiteId, p.blackId, games)) {
        warning = "Repeat pairing (no alternative)";
      } else if (result.colorRelaxed) {
        warning = "Color rule relaxed (no alternative)";
      }
      plans.push({
        board: plans.length + 1,
        whiteId: p.whiteId,
        blackId: p.blackId,
        isBye: false,
        byeForId: null,
        warning
      });
      colorStates.get(p.whiteId)!.diff += 1;
      colorStates.get(p.blackId)!.diff -= 1;
      colorStates.get(p.whiteId)!.lastColors.push("w");
      colorStates.get(p.blackId)!.lastColors.push("b");
    }
    floater = result.floater;
  }

  if (floater != null) {
    // Extremely rare: float chain left an unpaired player; give a bye
    plans.push({
      board: plans.length + 1,
      whiteId: null,
      blackId: null,
      isBye: true,
      byeForId: floater,
      warning: "Unpaired after float chain"
    });
  }
  if (byeFor != null) {
    plans.push({ board: plans.length + 1, whiteId: null, blackId: null, isBye: true, byeForId: byeFor });
  }
  return plans;
}

function pickBye(ordered: Player[], games: Game[]): number | null {
  const byeCount = new Map<number, number>();
  for (const g of games) {
    if (g.isBye && g.byeForId != null) {
      byeCount.set(g.byeForId, (byeCount.get(g.byeForId) ?? 0) + 1);
    }
  }
  const noBye = ordered.find((p) => (byeCount.get(p.id) ?? 0) === 0);
  if (noBye) return noBye.id;
  return ordered[ordered.length - 1]!.id;
}

export function validatePlan(plan: PairingPlan[], games: Game[], players: Player[]): string[] {
  const warnings: string[] = [];
  const seen = new Set<number>();
  const nameById = new Map(players.map((p) => [p.id, p.name]));
  const activeIds = new Set(players.filter((p) => p.active === 1).map((p) => p.id));
  const colorStates = new Map<number, ColorState>();
  for (const p of players) {
    if (p.active === 1) colorStates.set(p.id, colorState(p.id, games));
  }
  for (const p of plan) {
    if (p.isBye) {
      if (p.byeForId == null) warnings.push("Bye without a player");
      else if (seen.has(p.byeForId)) warnings.push("Player paired twice");
      else seen.add(p.byeForId);
      continue;
    }
    if (p.whiteId == null || p.blackId == null) {
      warnings.push("Pairing with a missing player");
      continue;
    }
    if (!activeIds.has(p.whiteId) || !activeIds.has(p.blackId)) {
      warnings.push("Pairing references an inactive player");
    }
    if (p.whiteId === p.blackId) {
      warnings.push("A player paired with themselves");
    }
    if (seen.has(p.whiteId) || seen.has(p.blackId)) {
      warnings.push("Player paired twice");
    }
    seen.add(p.whiteId);
    seen.add(p.blackId);
    if (playedBefore(p.whiteId, p.blackId, games)) {
      warnings.push(
        `${nameById.get(p.whiteId) ?? p.whiteId} vs ${nameById.get(p.blackId) ?? p.blackId} already played`
      );
    }
    for (const [id, color] of [
      [p.whiteId, "w"],
      [p.blackId, "b"]
    ] as [number, "w" | "b"][]) {
      const st = colorStates.get(id)!;
      const res = colorPenalty(st, color, true);
      if (!res.ok) {
        warnings.push(
          `${nameById.get(id) ?? id} gets a third consecutive same color or color imbalance (no alternative)`
        );
      }
      st.diff += color === "w" ? 1 : -1;
      st.lastColors.push(color);
    }
  }
  return warnings;
}
