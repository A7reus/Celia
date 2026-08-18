import type { StandingWithRank } from "./scoring";

export type SimulationResult = {
  standings: StandingWithRank[];
  rounds: number;
};
