import type { DealStage } from "../../types/deal";
import { formatMoneyString } from "../../lib/regional/format";

export const DEAL_STAGE_LABEL_KEY: Record<DealStage, string> = {
  new: "dealStageNew",
  qualification: "dealStageQualification",
  proposal: "dealStageProposal",
  negotiation: "dealStageNegotiation",
  closed_won: "dealStageClosedWon",
  closed_lost: "dealStageClosedLost",
};

export function dealStageBadgeClass(stage: DealStage): string {
  switch (stage) {
    case "new":
      return "bg-gray-100 text-gray-700";
    case "qualification":
      return "bg-blue-100 text-blue-700";
    case "proposal":
      return "bg-purple-100 text-purple-700";
    case "negotiation":
      return "bg-amber-100 text-amber-700";
    case "closed_won":
      return "bg-green-100 text-green-700";
    case "closed_lost":
      return "bg-red-100 text-red-700";
    default:
      return "bg-gray-100 text-gray-700";
  }
}

/** Formats a Deal.amount (Decimal-as-string) for display with the legacy
 * look (grouping, no currency). Components use useRegionalFormatters()
 * instead, which adds the company base currency. String based: never
 * converted to a JS number, never rounded. */
export function formatDealAmount(amount: string): string {
  return formatMoneyString(amount);
}
