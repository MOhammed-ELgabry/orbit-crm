import { describe, expect, it } from "vitest";

import {
  LEAD_FILTER_STATUSES,
  LEAD_STATUSES,
  LEAD_STATUS_CONVERTED,
} from "../../types/lead";
import { LEAD_STATUS_LABEL_KEY, leadStatusBadgeClass } from "./leadStatus";

describe("lead statuses", () => {
  it("'converted' can be filtered by but never offered in the create/edit form", () => {
    expect(LEAD_STATUSES as readonly string[]).not.toContain(
      LEAD_STATUS_CONVERTED,
    );
    expect(LEAD_FILTER_STATUSES as readonly string[]).toContain(
      LEAD_STATUS_CONVERTED,
    );
  });

  it("every status that can appear has a label", () => {
    for (const status of LEAD_FILTER_STATUSES) {
      expect(LEAD_STATUS_LABEL_KEY[status]).toBeTruthy();
    }
  });

  it("'converted' has its own badge style (not the unknown-status fallback)", () => {
    expect(leadStatusBadgeClass(LEAD_STATUS_CONVERTED)).not.toBe(
      leadStatusBadgeClass("some_unknown_status"),
    );
  });
});
