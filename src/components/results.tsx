import type { GameResult } from "@/types";

export function resultShort(result: GameResult | null): string {
  switch (result) {
    case "1-0":
      return "1";
    case "0-1":
      return "0";
    case "1/2":
      return "½";
    case "+":
      return "+";
    case "-":
      return "-";
    default:
      return "";
  }
}

export function resultText(result: GameResult | null): string {
  switch (result) {
    case "1-0":
      return "1-0";
    case "0-1":
      return "0-1";
    case "1/2":
      return "½-½";
    case "+":
      return "+";
    case "-":
      return "-";
    default:
      return "vs";
  }
}

export function resultCellClass(result: GameResult | null): string {
  switch (result) {
    case "1-0":
    case "0-1":
      return "bg-emerald-100 text-emerald-800 ";
    case "1/2":
      return "bg-amber-100 text-amber-800 ";
    case "+":
    case "-":
      return "bg-violet-100 text-violet-800 ";
    default:
      return "bg-slate-100 text-slate-500 ";
  }
}

export function playerResultShort(result: GameResult | null, color: "w" | "b" | null): string {
  if (result == null || color == null) return "";
  switch (result) {
    case "1-0":
      return color === "w" ? "1" : "0";
    case "0-1":
      return color === "b" ? "1" : "0";
    case "1/2":
      return "½";
    case "+":
      return color === "w" ? "+" : "-";
    case "-":
      return color === "b" ? "+" : "-";
    default:
      return "";
  }
}

export function playerResultCellClass(result: GameResult | null, color: "w" | "b" | null): string {
  if (result == null || color == null) return "bg-slate-100 text-slate-500 ";
  let playerWon: boolean;
  switch (result) {
    case "1-0":
      playerWon = color === "w";
      break;
    case "0-1":
      playerWon = color === "b";
      break;
    case "1/2":
      return "bg-amber-100 text-amber-800 ";
    case "+":
      playerWon = color === "w";
      break;
    case "-":
      playerWon = color === "b";
      break;
    default:
      return "bg-slate-100 text-slate-500 ";
  }
  return playerWon ? "bg-emerald-100 text-emerald-800 " : "bg-rose-100 text-rose-800 ";
}

export function scoreFmt(score: number): string {
  return Number.isInteger(score) ? String(score) : score.toFixed(1);
}
