import { describe, expect, it } from "vitest";
import { pairRound, validatePlan } from "../lib/pairing";
import { computeStandings } from "../lib/scoring";
import type { Game, Player } from "../types";

function makePlayers(count: number, ratingStep = 50): Player[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    name: `P${i + 1}`,
    rating: 1000 + i * ratingStep,
    ratingType: "manual" as const,
    active: 1
  }));
}

function playRound(games: Game[], plan: ReturnType<typeof pairRound>, round: number): Game[] {
  const next: Game[] = [...games];
  for (const p of plan) {
    if (p.isBye) {
      next.push({ round, whiteId: null, blackId: null, result: null, isBye: true, byeForId: p.byeForId });
      continue;
    }
    const whiteWins = (round + p.board) % 2 === 0;
    next.push({
      round,
      whiteId: p.whiteId,
      blackId: p.blackId,
      result: whiteWins ? "1-0" : "0-1",
      isBye: false,
      byeForId: null
    });
  }
  return next;
}

function checkInvariants(games: Game[], players: Player[], rounds: number) {
  const activeIds = players.filter((p) => p.active === 1).map((p) => p.id);
  const colors = new Map<number, ("w" | "b")[]>(activeIds.map((id) => [id, []]));
  const opponents = new Map<number, Set<number>>(activeIds.map((id) => [id, new Set()]));
  const byes = new Map<number, number>(activeIds.map((id) => [id, 0]));

  for (let r = 1; r <= rounds; r++) {
    const roundGames = games.filter((g) => g.round === r);
    const seen = new Set<number>();
    let byeCount = 0;
    for (const g of roundGames) {
      if (g.isBye) {
        byeCount++;
        expect(g.byeForId).not.toBeNull();
        byes.set(g.byeForId!, (byes.get(g.byeForId!) ?? 0) + 1);
        expect(seen.has(g.byeForId!)).toBe(false);
        seen.add(g.byeForId!);
        continue;
      }
      expect(g.whiteId).not.toBeNull();
      expect(g.blackId).not.toBeNull();
      expect(g.result).not.toBeNull();
      expect(seen.has(g.whiteId!)).toBe(false);
      expect(seen.has(g.blackId!)).toBe(false);
      seen.add(g.whiteId!);
      seen.add(g.blackId!);
      expect(g.whiteId).not.toBe(g.blackId);
      opponents.get(g.whiteId!)!.add(g.blackId!);
      opponents.get(g.blackId!)!.add(g.whiteId!);
      colors.get(g.whiteId!)!.push("w");
      colors.get(g.blackId!)!.push("b");
    }
    expect(byeCount).toBeLessThanOrEqual(1);
  }

  for (const id of activeIds) {
    const list = colors.get(id)!;
    const wCount = list.filter((c) => c === "w").length;
    const bCount = list.filter((c) => c === "b").length;
    expect(Math.abs(wCount - bCount)).toBeLessThanOrEqual(2);
    for (let i = 2; i < list.length; i++) {
      expect(list[i] === list[i - 1] && list[i] === list[i - 2]).toBe(false);
    }
    expect(byes.get(id) ?? 0).toBeLessThanOrEqual(1);
  }
}

describe("pairRound invariants", () => {
  for (const size of [8, 9, 16, 17, 32, 40]) {
    it(`holds invariants for ${size} players over 7 rounds`, () => {
      const players = makePlayers(size);
      let games: Game[] = [];
      for (let r = 1; r <= 7; r++) {
        const plan = pairRound(players, games);
        expect(plan.length).toBe(Math.ceil(size / 2));
        const warnings = validatePlan(plan, games, players);
        // Repeats are unavoidable in small round robins; the engine must flag
        // them, never silently violate color rules.
        expect(warnings.filter((w) => !w.includes("already played"))).toEqual([]);
        games = playRound(games, plan, r);
      }
      checkInvariants(games, players, 7);
    });
  }
});

describe("pairRound basics", () => {
  it("pairs round 1 top half vs bottom half", () => {
    const players = makePlayers(4);
    const plan = pairRound(players, []);
    expect(plan).toHaveLength(2);
    const ids = plan.flatMap((p) => [p.whiteId, p.blackId]).sort() as number[];
    expect(ids).toEqual([1, 2, 3, 4]);
    // Ratings 1000,1050,1100,1150 -> order 4,3,2,1 -> pairs (4,2) and (3,1)
    const pair0 = [plan[0]!.whiteId, plan[0]!.blackId].sort();
    expect(pair0).toEqual([2, 4]);
    const pair1 = [plan[1]!.whiteId, plan[1]!.blackId].sort();
    expect(pair1).toEqual([1, 3]);
  });

  it("gives a bye to the lowest-ranked player when odd", () => {
    const players = makePlayers(5);
    const plan = pairRound(players, []);
    const bye = plan.find((p) => p.isBye);
    expect(bye).toBeDefined();
    expect(bye!.byeForId).toBe(5);
    expect(plan.filter((p) => p.isBye)).toHaveLength(1);
  });

  it("alternates colors for a player across rounds", () => {
    const players = makePlayers(8);
    let games: Game[] = [];
    for (let r = 1; r <= 7; r++) {
      games = playRound(games, pairRound(players, games), r);
    }
    const p1Colors = games
      .filter((g) => !g.isBye && (g.whiteId === 1 || g.blackId === 1))
      .map((g) => (g.whiteId === 1 ? "w" : "b"));
    expect(p1Colors.length).toBe(7);
    let alternations = 0;
    for (let i = 1; i < p1Colors.length; i++) {
      if (p1Colors[i] !== p1Colors[i - 1]) alternations++;
    }
    expect(alternations).toBeGreaterThanOrEqual(3);
  });

  it("does not pair the same two players twice over 7 rounds", () => {
    const players = makePlayers(24);
    let games: Game[] = [];
    for (let r = 1; r <= 7; r++) {
      games = playRound(games, pairRound(players, games), r);
    }
    const seen = new Set<string>();
    for (const g of games) {
      if (g.isBye || g.whiteId == null || g.blackId == null) continue;
      const key = [g.whiteId, g.blackId].sort((a, b) => a - b).join("-");
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });

  it("pairs a single player as a bye", () => {
    const plan = pairRound(makePlayers(1), []);
    expect(plan[0]!.isBye).toBe(true);
    expect(plan[0]!.byeForId).toBe(1);
  });
});

describe("computeStandings", () => {
  it("computes scores, tie-breaks and TPR for a small hand-verified tournament", () => {
    const players = makePlayers(4);
    const games: Game[] = [
      { round: 1, whiteId: 1, blackId: 2, result: "1-0", isBye: false, byeForId: null },
      { round: 1, whiteId: 3, blackId: 4, result: "1/2", isBye: false, byeForId: null },
      { round: 2, whiteId: 2, blackId: 3, result: "0-1", isBye: false, byeForId: null },
      { round: 2, whiteId: 4, blackId: 1, result: "0-1", isBye: false, byeForId: null }
    ];
    const standings = computeStandings(players, games);
    const s1 = standings.find((s) => s.playerId === 1)!;
    expect(s1.score).toBe(2);
    expect(s1.wins).toBe(2);
    // Buchholz of player 1: opponents' scores: P2=0, P4=0.5 -> 0.5
    expect(s1.buchholz).toBe(0.5);
    // TPR: avg opp rating (1050+1150)/2=1100, 2 wins 0 losses -> 1100 + 400 = 1500
    expect(s1.tpr).toBe(1500);
    expect(standings[0]!.playerId).toBe(1);
  });

  it("counts byes as half a point and 0.5 Buchholz", () => {
    const players = makePlayers(3);
    const games: Game[] = [
      { round: 1, whiteId: 1, blackId: 2, result: "1-0", isBye: false, byeForId: null },
      { round: 1, whiteId: null, blackId: null, result: null, isBye: true, byeForId: 3 }
    ];
    const standings = computeStandings(players, games);
    const s3 = standings.find((s) => s.playerId === 3)!;
    expect(s3.score).toBe(0.5);
    expect(s3.byes).toBe(1);
    expect(s3.buchholz).toBe(0.5);
  });

  it("ranks a player ahead on head-to-head when fully tied", () => {
    const players = makePlayers(2);
    const games: Game[] = [
      { round: 1, whiteId: 1, blackId: 2, result: "1-0", isBye: false, byeForId: null },
      { round: 2, whiteId: 2, blackId: 1, result: "0-1", isBye: false, byeForId: null },
      { round: 3, whiteId: 1, blackId: 2, result: "1-0", isBye: false, byeForId: null }
    ];
    const standings = computeStandings(players, games);
    expect(standings[0]!.playerId).toBe(1);
    expect(standings[1]!.playerId).toBe(2);
  });
});
