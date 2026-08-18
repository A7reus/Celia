import type { Game, GameResult, Player, Standing, StandingWithRank, PlayerAgg } from "@/types";

export const REAL_RESULTS: GameResult[] = ["1-0", "0-1", "1/2"];

function pointsForPlayer(result: GameResult, isWhite: boolean): number {
  switch (result) {
    case "1-0":
      return isWhite ? 1 : 0;
    case "0-1":
      return isWhite ? 0 : 1;
    case "1/2":
      return 0.5;
    case "+":
      return isWhite ? 1 : 0;
    case "-":
      return isWhite ? 0 : 1;
  }
}

export function computeStandings(players: Player[], games: Game[]): StandingWithRank[] {
  const agg = new Map<number, PlayerAgg>();
  const playersById = new Map(players.map((p) => [p.id, p]));

  for (const p of players) {
    agg.set(p.id, {
      score: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      byes: 0,
      played: 0,
      opponents: [],
      realOpponentIds: [],
      oppRatings: [],
      whiteCount: 0,
      blackCount: 0,
      games: []
    });
  }

  // Pass 1: scores
  for (const g of games) {
    if (g.isBye && g.byeForId != null) {
      const a = agg.get(g.byeForId);
      if (a) {
        a.score += 0.5;
        a.draws += 1;
        a.byes += 1;
        a.games.push({ round: g.round, opponentId: null, opponentName: null, color: null, result: null, isBye: true });
      }
      continue;
    }
    if (g.whiteId == null || g.blackId == null || g.result == null) continue;
    const w = agg.get(g.whiteId);
    const b = agg.get(g.blackId);
    if (!w || !b) continue;
    const isReal = REAL_RESULTS.includes(g.result);
    const wPoints = pointsForPlayer(g.result, true);
    const bPoints = pointsForPlayer(g.result, false);
    w.score += wPoints;
    b.score += bPoints;
    if (wPoints === 1) w.wins += 1;
    else if (wPoints === 0.5) w.draws += 1;
    else w.losses += 1;
    if (bPoints === 1) b.wins += 1;
    else if (bPoints === 0.5) b.draws += 1;
    else b.losses += 1;
    if (isReal) {
      w.played += 1;
      b.played += 1;
      w.whiteCount += 1;
      b.blackCount += 1;
    }
    w.opponents.push({ id: g.blackId, score: 0, real: isReal });
    b.opponents.push({ id: g.whiteId, score: 0, real: isReal });
    if (isReal) {
      w.realOpponentIds.push(g.blackId);
      b.realOpponentIds.push(g.whiteId);
      const wr = playersById.get(g.blackId);
      const br = playersById.get(g.whiteId);
      if (wr) w.oppRatings.push(wr.rating);
      if (br) b.oppRatings.push(br.rating);
    }
    w.games.push({
      round: g.round,
      opponentId: g.blackId,
      opponentName: playersById.get(g.blackId)?.name ?? null,
      color: "w",
      result: g.result,
      isBye: false
    });
    b.games.push({
      round: g.round,
      opponentId: g.whiteId,
      opponentName: playersById.get(g.whiteId)?.name ?? null,
      color: "b",
      result: g.result,
      isBye: false
    });
  }

  // Opponent scores for Buchholz
  for (const g of games) {
    if (g.whiteId == null || g.blackId == null || g.result == null) continue;
    const w = agg.get(g.whiteId);
    const b = agg.get(g.blackId);
    if (!w || !b) continue;
    for (const opp of w.opponents) {
      if (opp.id === g.blackId) opp.score = b.score;
    }
    for (const opp of b.opponents) {
      if (opp.id === g.whiteId) opp.score = w.score;
    }
  }

  const standings = players.map((p) => {
    const a = agg.get(p.id)!;
    const realOppScores = a.opponents.filter((o) => o.real).map((o) => o.score);
    const allOppScores = a.opponents.map((o) => o.score);
    const buchholz = allOppScores.reduce((s, x) => s + x, 0) + a.byes * 0.5;

    let medianBuchholz = buchholz;
    if (a.opponents.length >= 3) {
      const sorted = [...allOppScores].sort((x, y) => x - y);
      medianBuchholz = buchholz - (sorted[0] ?? 0) - (sorted[sorted.length - 1] ?? 0);
    }

    const gameFor = (oppId: number) => a.games.find((g) => !g.isBye && g.opponentId === oppId && g.result != null);

    const sb = realOppScores.reduce((s, score, i) => {
      const result = gameFor(a.realOpponentIds[i]!)?.result;
      if (!result) return s;
      if (result === "1/2") return s + score / 2;
      const won =
        (result === "1-0" && a.games.find((g) => g.opponentId === a.realOpponentIds[i])?.color === "w") ||
        (result === "0-1" && a.games.find((g) => g.opponentId === a.realOpponentIds[i])?.color === "b");
      return s + (won ? score : 0);
    }, 0);

    const koya = a.realOpponentIds.reduce((s, oppId) => {
      const opp = agg.get(oppId);
      const oppGames = opp ? opp.opponents.length + opp.byes : 0;
      if (!opp || oppGames === 0 || opp.score < oppGames / 2) return s;
      const result = gameFor(oppId)?.result;
      if (result === "1/2") return s + 0.5;
      const won =
        (result === "1-0" && a.games.find((g) => g.opponentId === oppId)?.color === "w") ||
        (result === "0-1" && a.games.find((g) => g.opponentId === oppId)?.color === "b");
      return s + (won ? 1 : 0);
    }, 0);

    let tpr: number | null = null;
    if (a.played > 0 && a.oppRatings.length > 0) {
      const avg = a.oppRatings.reduce((s, r) => s + r, 0) / a.oppRatings.length;
      let realWins = 0;
      let realLosses = 0;
      for (const oppId of a.realOpponentIds) {
        const result = gameFor(oppId)?.result;
        if (!result) continue;
        const color = a.games.find((g) => g.opponentId === oppId)?.color;
        if ((result === "1-0" && color === "w") || (result === "0-1" && color === "b")) realWins++;
        if ((result === "0-1" && color === "w") || (result === "1-0" && color === "b")) realLosses++;
      }
      tpr = Math.round(avg + (400 * (realWins - realLosses)) / a.played);
    }

    return {
      playerId: p.id,
      name: p.name,
      rating: p.rating,
      ratingType: p.ratingType,
      score: a.score,
      wins: a.wins,
      draws: a.draws,
      losses: a.losses,
      byes: a.byes,
      played: a.played,
      buchholz: round1(buchholz),
      medianBuchholz: round1(medianBuchholz),
      sonnebornBerger: round1(sb),
      koya: round1(koya),
      tpr,
      whiteCount: a.whiteCount,
      blackCount: a.blackCount,
      games: a.games
    };
  }) as StandingWithRank[];

  // Points strictly dominate: tie-breaks are only applied between equal scores.
  standings.sort((a, b) => {
    if (a.score !== b.score) return b.score - a.score;
    if (a.buchholz !== b.buchholz) return b.buchholz - a.buchholz;
    if (a.medianBuchholz !== b.medianBuchholz) return b.medianBuchholz - a.medianBuchholz;
    if (a.sonnebornBerger !== b.sonnebornBerger) return b.sonnebornBerger - a.sonnebornBerger;
    if (a.koya !== b.koya) return b.koya - a.koya;
    if (a.wins !== b.wins) return b.wins - a.wins;
    if (a.rating !== b.rating) return b.rating - a.rating;
    return headToHead(a, b, games);
  });

  standings.forEach((s, i) => {
    s.rank = i + 1;
  });
  return standings;
}

function headToHead(a: Standing, b: Standing, games: Game[]): number {
  const game = games.find(
    (g) =>
      !g.isBye &&
      ((g.whiteId === a.playerId && g.blackId === b.playerId) ||
        (g.whiteId === b.playerId && g.blackId === a.playerId)) &&
      g.result != null
  );
  if (!game) return 0;
  const aIsWhite = game.whiteId === a.playerId;
  const aPoints = pointsForPlayer(game.result as GameResult, aIsWhite);
  if (aPoints === 1) return -1;
  if (aPoints === 0) return 1;
  return 0;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
