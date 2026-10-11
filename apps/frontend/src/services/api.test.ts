import axios, { AxiosError, type InternalAxiosRequestConfig } from "axios";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type ApiModule = typeof import("./api");

/**
 * Centralized HTTP 401 handling (decision D3).
 *
 * api.ts keeps module-level state (the shared refresh promise and the
 * "session ended" flag), so each test loads a fresh copy of the module.
 * The data requests go through a stub adapter on the `api` instance; the
 * refresh call is a plain `axios.post` and is spied on directly.
 */
describe("api — centralized 401 handling", () => {
  let mod: ApiModule;
  let postSpy: ReturnType<typeof vi.spyOn>;
  // How the stub backend answers each data request, in order of arrival.
  let responder: (config: InternalAxiosRequestConfig) => Promise<unknown>;
  let dataCalls: string[];

  const unauthorized = (config: InternalAxiosRequestConfig) =>
    Promise.reject(
      new AxiosError("Unauthorized", "ERR_BAD_REQUEST", config, null, {
        status: 401,
        statusText: "Unauthorized",
        headers: {},
        config,
        data: {},
      }),
    );

  const ok = (config: InternalAxiosRequestConfig, data: unknown = { ok: 1 }) =>
    Promise.resolve({
      status: 200,
      statusText: "OK",
      headers: {},
      config,
      data,
    });

  const refreshFailsWith = (status: number | undefined) =>
    postSpy.mockImplementation(() =>
      Promise.reject(
        new AxiosError(
          "refresh failed",
          status ? "ERR_BAD_REQUEST" : "ERR_NETWORK",
          undefined,
          null,
          status
            ? {
                status,
                statusText: "",
                headers: {},
                config: {} as InternalAxiosRequestConfig,
                data: {},
              }
            : undefined,
        ),
      ),
    );

  beforeEach(async () => {
    vi.resetModules();
    mod = await import("./api");
    dataCalls = [];
    responder = (config) => ok(config);
    mod.default.defaults.adapter = (config) => {
      dataCalls.push(`${config.method}:${config.url}`);
      return responder(config) as ReturnType<
        NonNullable<typeof mod.default.defaults.adapter> & ((c: never) => never)
      >;
    };
    postSpy = vi
      .spyOn(axios, "post")
      .mockResolvedValue({ status: 200, data: {} });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("passes a successful response straight through without refreshing", async () => {
    const res = await mod.default.get("/deals");

    expect(res.data).toEqual({ ok: 1 });
    expect(postSpy).not.toHaveBeenCalled();
  });

  it("refreshes once on a 401 and retries the original request exactly once", async () => {
    let n = 0;
    responder = (config) => (++n === 1 ? unauthorized(config) : ok(config));

    const res = await mod.default.get("/deals");

    expect(res.data).toEqual({ ok: 1 });
    expect(postSpy).toHaveBeenCalledTimes(1);
    expect(dataCalls).toEqual(["get:/deals", "get:/deals"]);
  });

  it("shares ONE refresh between concurrent 401s", async () => {
    const seen = new Set<string>();
    responder = (config) => {
      const key = String(config.url);
      if (!seen.has(key)) {
        seen.add(key);
        return unauthorized(config);
      }
      return ok(config);
    };

    await Promise.all([
      mod.default.get("/deals"),
      mod.default.get("/leads"),
      mod.default.get("/tasks"),
    ]);

    expect(postSpy).toHaveBeenCalledTimes(1);
    expect(dataCalls).toHaveLength(6);
  });

  it("does not retry again when the retried request is still 401 (no loop)", async () => {
    responder = (config) => unauthorized(config);

    await expect(mod.default.get("/deals")).rejects.toMatchObject({
      response: { status: 401 },
    });

    expect(postSpy).toHaveBeenCalledTimes(1);
    expect(dataCalls).toEqual(["get:/deals", "get:/deals"]);
  });

  it("ends the session ONCE when the refresh is refused, and stops refreshing afterwards", async () => {
    const onEnded = vi.fn();
    mod.setSessionEndedListener(onEnded);
    responder = (config) => unauthorized(config);
    refreshFailsWith(400); // e.g. "User account is inactive" / revoked token

    await expect(mod.default.get("/deals")).rejects.toMatchObject({
      response: { status: 401 },
    });

    expect(onEnded).toHaveBeenCalledTimes(1);
    expect(postSpy).toHaveBeenCalledTimes(1);

    // Every later 401 is rejected immediately: no refresh, no retry, no
    // second notification.
    await expect(mod.default.get("/leads")).rejects.toMatchObject({
      response: { status: 401 },
    });
    await expect(mod.default.get("/tasks")).rejects.toMatchObject({
      response: { status: 401 },
    });

    expect(postSpy).toHaveBeenCalledTimes(1);
    expect(onEnded).toHaveBeenCalledTimes(1);
    expect(dataCalls.filter((c) => c === "get:/leads")).toHaveLength(1);
  });

  it("notifies once even when several concurrent requests 401 and the refresh is refused", async () => {
    const onEnded = vi.fn();
    mod.setSessionEndedListener(onEnded);
    responder = (config) => unauthorized(config);
    refreshFailsWith(401);

    await Promise.allSettled([
      mod.default.get("/deals"),
      mod.default.get("/leads"),
      mod.default.get("/tasks"),
    ]);

    expect(postSpy).toHaveBeenCalledTimes(1);
    expect(onEnded).toHaveBeenCalledTimes(1);
  });

  it("allows refreshing again after markSessionActive() (a new login)", async () => {
    mod.setSessionEndedListener(vi.fn());
    responder = (config) => unauthorized(config);
    refreshFailsWith(400);
    await expect(mod.default.get("/deals")).rejects.toBeTruthy();
    expect(postSpy).toHaveBeenCalledTimes(1);

    mod.markSessionActive();
    postSpy.mockResolvedValue({ status: 200, data: {} });
    let n = 0;
    responder = (config) => (++n === 1 ? unauthorized(config) : ok(config));

    await expect(mod.default.get("/deals")).resolves.toMatchObject({
      status: 200,
    });
    expect(postSpy).toHaveBeenCalledTimes(2);
  });

  it("does NOT end the session on a transient refresh failure (network error / 5xx / 429)", async () => {
    const onEnded = vi.fn();
    mod.setSessionEndedListener(onEnded);
    responder = (config) => unauthorized(config);

    for (const status of [undefined, 500, 503, 429]) {
      refreshFailsWith(status);
      await expect(mod.default.get("/deals")).rejects.toMatchObject({
        response: { status: 401 },
      });
    }

    expect(onEnded).not.toHaveBeenCalled();
  });

  it("never refreshes or retries /auth/* requests (login, /auth/me, ...)", async () => {
    const onEnded = vi.fn();
    mod.setSessionEndedListener(onEnded);
    responder = (config) => unauthorized(config);

    await expect(mod.default.get("/auth/me")).rejects.toMatchObject({
      response: { status: 401 },
    });
    await expect(
      mod.default.post("/auth/login", { email: "a", password: "b" }),
    ).rejects.toMatchObject({ response: { status: 401 } });

    expect(postSpy).not.toHaveBeenCalled();
    expect(onEnded).not.toHaveBeenCalled();
    expect(dataCalls).toHaveLength(2);
  });

  it("does not refresh after an explicit logout (markSessionInactive)", async () => {
    mod.markSessionInactive();
    responder = (config) => unauthorized(config);

    await expect(mod.default.get("/deals")).rejects.toMatchObject({
      response: { status: 401 },
    });

    expect(postSpy).not.toHaveBeenCalled();
  });

  it("leaves non-401 errors alone (403 / 500 are not session problems)", async () => {
    const onEnded = vi.fn();
    mod.setSessionEndedListener(onEnded);
    responder = (config) =>
      Promise.reject(
        new AxiosError("Forbidden", "ERR_BAD_REQUEST", config, null, {
          status: 403,
          statusText: "Forbidden",
          headers: {},
          config,
          data: {},
        }),
      );

    await expect(mod.default.get("/deals")).rejects.toMatchObject({
      response: { status: 403 },
    });

    expect(postSpy).not.toHaveBeenCalled();
    expect(onEnded).not.toHaveBeenCalled();
  });

  it("unsubscribing the listener stops notifications", async () => {
    const onEnded = vi.fn();
    const unsubscribe = mod.setSessionEndedListener(onEnded);
    unsubscribe();
    responder = (config) => unauthorized(config);
    refreshFailsWith(400);

    await expect(mod.default.get("/deals")).rejects.toBeTruthy();

    expect(onEnded).not.toHaveBeenCalled();
  });
});
