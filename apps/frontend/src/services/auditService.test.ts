import { beforeEach, describe, expect, it, vi } from "vitest";

const http = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
}));

vi.mock("./api", () => ({ default: http, API_BASE_URL: "http://x.test" }));

import { getAuditLog, listAuditActors, listAuditLogs } from "./auditService";

describe("auditService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lists with GET /audit-logs, dropping empty filters", async () => {
    http.get.mockResolvedValue({
      data: { data: [{ id: "a" }], meta: { page: 1, total: 1 } },
    });

    const result = await listAuditLogs({
      page: 2,
      limit: 20,
      from: "2026-10-01T00:00:00.000Z",
      q: "",
      actorUserId: undefined,
    });

    expect(http.get).toHaveBeenCalledWith("/audit-logs", {
      params: { page: 2, limit: 20, from: "2026-10-01T00:00:00.000Z" },
      signal: undefined,
    });
    expect(result).toEqual({
      items: [{ id: "a" }],
      meta: { page: 1, total: 1 },
    });
  });

  it("fetches actors with GET /audit-logs/actors", async () => {
    http.get.mockResolvedValue({ data: { data: [{ id: "u" }] } });

    await expect(listAuditActors()).resolves.toEqual([{ id: "u" }]);
    expect(http.get).toHaveBeenCalledWith("/audit-logs/actors", {
      signal: undefined,
    });
  });

  it("url-encodes the id of a detail request", async () => {
    http.get.mockResolvedValue({ data: { data: { id: "x" } } });

    await getAuditLog("a/b?c");

    expect(http.get).toHaveBeenCalledWith("/audit-logs/a%2Fb%3Fc", {
      signal: undefined,
    });
  });

  it("only ever issues GET requests: no write call exists or is made", async () => {
    http.get.mockResolvedValue({ data: { data: [], meta: {} } });

    await listAuditLogs({ page: 1, limit: 20 });
    await listAuditActors();

    expect(http.post).not.toHaveBeenCalled();
    expect(http.put).not.toHaveBeenCalled();
    expect(http.patch).not.toHaveBeenCalled();
    expect(http.delete).not.toHaveBeenCalled();
  });
});
