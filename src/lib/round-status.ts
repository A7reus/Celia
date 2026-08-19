import type { RoundStatus } from "@/types";

export function roundStatusLabel(status: RoundStatus): string {
  switch (status) {
    case "draft":
      return "bg-gray-100 text-gray-700";
    case "published":
      return "bg-blue-100 text-blue-700";
    case "completed":
      return "bg-green-100 text-green-700";
  }
}
