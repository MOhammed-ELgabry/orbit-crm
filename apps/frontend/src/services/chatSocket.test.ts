import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./api", () => ({ API_BASE_URL: "http://api.example.test:3000" }));

import {
  ChatSocket,
  STABLE_AFTER_MS,
  backoffDelay,
  buildChatSocketUrl,
  parseChatEvent,
  type ChatSocketStatus,
  type SessionProbeResult,
} from "./chatSocket";
import { FakeSocket } from "../test/chatFakes";
import type { ChatServerEvent } from "../types/chat";

describe("buildChatSocketUrl", () => {
  it("maps http(s) to ws(s) and appends the socket path", () => {
    expect(buildChatSocketUrl("http://162.35.172.155:3000")).toBe(
      "ws://162.35.172.155:3000/chat/ws",
    );
    expect(buildChatSocketUrl("https://api.orbit.test/")).toBe(
      "wss://api.orbit.test/chat/ws",
    );
    expect(buildChatSocketUrl("https://api.orbit.test/v1")).toBe(
      "wss://api.orbit.test/v1/chat/ws",
    );
  });
});

describe("parseChatEvent", () => {
  it("accepts known events and drops everything else without throwing", () => {
    expect(parseChatEvent('{"type":"pong","serverTime":"x"}')).toMatchObject({
      type: "pong",
    });
    expect(parseChatEvent('{"type":"mystery"}')).toBeNull();
    expect(parseChatEvent("not json")).toBeNull();
    expect(parseChatEvent("null")).toBeNull();
    expect(parseChatEvent('"ready"')).toBeNull();
    expect(parseChatEvent(new ArrayBuffer(4))).toBeNull();
    expect(parseChatEvent(undefined)).toBeNull();
  });
});

describe("backoffDelay", () => {
  it("grows exponentially with jitter and is capped", () => {
    expect(backoffDelay(1, 1006, () => 1)).toBe(1_000);
    expect(backoffDelay(2, 1006, () => 1)).toBe(2_000);
    expect(backoffDelay(3, 1006, () => 0)).toBe(2_000);
    expect(backoffDelay(20, 1006, () => 1)).toBe(30_000);
    expect(backoffDelay(20, 1006, () => 0)).toBe(15_000);
  });

  it("reconnects at once after a token expiry, but only for the first attempt", () => {
    expect(backoffDelay(1, 4401)).toBe(0);
    expect(backoffDelay(2, 4401, () => 1)).toBe(2_000);
  });

  it("waits longer after a policy violation or an oversized frame", () => {
    expect(backoffDelay(1, 1008, () => 0)).toBeGreaterThanOrEqual(5_000);
    expect(backoffDelay(1, 1009, () => 0)).toBe(30_000);
  });
});

describe("ChatSocket lifecycle", () => {
  let probe: ReturnType<typeof vi.fn<() => Promise<SessionProbeResult>>>;
  let events: ChatServerEvent[];
  let statuses: ChatSocketStatus[];
  let client: ChatSocket;

  const flush = () => vi.advanceTimersByTimeAsync(0);

  beforeEach(() => {
    vi.useFakeTimers();
    FakeSocket.reset();
    probe = vi.fn<() => Promise<SessionProbeResult>>().mockResolvedValue("ok");
    events = [];
    statuses = [];

    client = new ChatSocket({
      url: "ws://test/chat/ws",
      probeSession: probe,
      onEvent: (event) => events.push(event),
      onStatus: (status) => statuses.push(status),
      createSocket: (url) => new FakeSocket(url),
      random: () => 1,
    });
  });

  afterEach(() => {
    client.stop();
    vi.useRealTimers();
  });

  it("probes the session before opening and goes online on `ready`", async () => {
    client.start();
    expect(statuses).toEqual(["connecting"]);
    expect(FakeSocket.instances).toHaveLength(0);

    await flush();
    expect(probe).toHaveBeenCalledTimes(1);
    expect(FakeSocket.instances).toHaveLength(1);
    expect(FakeSocket.last().url).toBe("ws://test/chat/ws");

    FakeSocket.last().ready();
    expect(client.getStatus()).toBe("online");
    expect(events[0]).toMatchObject({ type: "ready" });
  });

  it("forwards valid events and ignores malformed frames", async () => {
    client.start();
    await flush();
    const socket = FakeSocket.last();
    socket.ready();

    socket.receive("garbage");
    socket.receive({ type: "nope" });
    socket.receive({
      type: "presence.update",
      userId: "u2",
      online: true,
      lastSeenAt: null,
    });

    expect(events.map((e) => e.type)).toEqual(["ready", "presence.update"]);
  });

  it("sends only a ping, on the server's heartbeat interval", async () => {
    client.start();
    await flush();
    const socket = FakeSocket.last();
    socket.ready(5_000);

    await vi.advanceTimersByTimeAsync(5_000);
    socket.receive({ type: "pong", serverTime: "x" });
    await vi.advanceTimersByTimeAsync(5_000);

    expect(socket.sent).toEqual(['{"type":"ping"}', '{"type":"ping"}']);
  });

  it("reconnects with backoff after a drop, probing the session again", async () => {
    client.start();
    await flush();
    FakeSocket.last().ready();

    FakeSocket.last().serverClose(1006);
    expect(client.getStatus()).toBe("reconnecting");
    expect(FakeSocket.instances).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(999);
    expect(FakeSocket.instances).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(1);
    expect(probe).toHaveBeenCalledTimes(2);
    expect(FakeSocket.instances).toHaveLength(2);
  });

  it("reconnects immediately after a token expiry (4401)", async () => {
    client.start();
    await flush();
    FakeSocket.last().ready();
    await vi.advanceTimersByTimeAsync(STABLE_AFTER_MS);

    FakeSocket.last().serverClose(4401);
    await flush();

    expect(FakeSocket.instances).toHaveLength(2);
  });

  it("keeps growing the delay while connections are not stable (no 1 s hot loop)", async () => {
    client.start();
    await flush();

    const delays: number[] = [];

    for (let i = 0; i < 4; i += 1) {
      FakeSocket.last().ready();
      const before = Date.now();
      FakeSocket.last().serverClose(1006);

      let waited = 0;
      while (FakeSocket.instances.length === i + 1 && waited < 60_000) {
        await vi.advanceTimersByTimeAsync(100);
        waited += 100;
      }
      delays.push(Date.now() - before);
    }

    expect(delays[1]).toBeGreaterThan(delays[0]);
    expect(delays[2]).toBeGreaterThan(delays[1]);
  });

  it("resets the backoff once a connection has been stable", async () => {
    client.start();
    await flush();

    for (let i = 0; i < 3; i += 1) {
      const known = FakeSocket.instances.length;
      FakeSocket.last().serverClose(1006);

      for (
        let waited = 0;
        FakeSocket.instances.length === known;
        waited += 100
      ) {
        expect(waited).toBeLessThan(60_000);
        await vi.advanceTimersByTimeAsync(100);
      }
    }

    FakeSocket.last().ready();
    await vi.advanceTimersByTimeAsync(STABLE_AFTER_MS);

    const count = FakeSocket.instances.length;
    FakeSocket.last().serverClose(1006);
    await vi.advanceTimersByTimeAsync(1_000);

    expect(FakeSocket.instances).toHaveLength(count + 1);
  });

  it("declares a silent connection dead and reconnects", async () => {
    client.start();
    await flush();
    FakeSocket.last().ready(2_000);

    await vi.advanceTimersByTimeAsync(2_000 * 2.5);
    expect(client.getStatus()).toBe("reconnecting");
    expect(FakeSocket.instances[0].closedWith).toBe(1000);

    await vi.advanceTimersByTimeAsync(1_000);
    expect(FakeSocket.instances).toHaveLength(2);
  });

  it("abandons a socket that never sends `ready`", async () => {
    client.start();
    await flush();
    FakeSocket.last().open();

    await vi.advanceTimersByTimeAsync(10_000);
    expect(client.getStatus()).toBe("reconnecting");
  });

  it("stops for good when the server says chat is not available (denied)", async () => {
    probe.mockResolvedValue("denied");
    client.start();
    await flush();

    expect(client.getStatus()).toBe("unavailable");
    await vi.advanceTimersByTimeAsync(120_000);
    expect(FakeSocket.instances).toHaveLength(0);
    expect(probe).toHaveBeenCalledTimes(1);
  });

  it("retries the probe with backoff while the network is down", async () => {
    probe.mockResolvedValueOnce("retry").mockResolvedValue("ok");
    client.start();
    await flush();

    expect(client.getStatus()).toBe("reconnecting");
    expect(FakeSocket.instances).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(1_000);
    expect(FakeSocket.instances).toHaveLength(1);
  });

  it("treats a throwing probe like a failed one", async () => {
    probe.mockRejectedValueOnce(new Error("boom")).mockResolvedValue("ok");
    client.start();
    await flush();
    await vi.advanceTimersByTimeAsync(1_000);

    expect(FakeSocket.instances).toHaveLength(1);
  });

  it("stop() closes the socket, clears every timer and never reconnects", async () => {
    client.start();
    await flush();
    const socket = FakeSocket.last();
    socket.ready();

    client.stop();
    expect(socket.closedWith).toBe(1000);
    expect(client.getStatus()).toBe("stopped");
    expect(vi.getTimerCount()).toBe(0);

    socket.serverClose(1006);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(FakeSocket.instances).toHaveLength(1);
    expect(events.filter((e) => e.type === "ready")).toHaveLength(1);
  });

  it("stop() during the session probe prevents the socket from ever opening", async () => {
    let release: (value: SessionProbeResult) => void = () => undefined;
    probe.mockReturnValue(new Promise((resolve) => (release = resolve)));

    client.start();
    client.stop();
    release("ok");
    await flush();

    expect(FakeSocket.instances).toHaveLength(0);
  });

  it("start() twice does not create two connections", async () => {
    client.start();
    client.start();
    await flush();

    expect(FakeSocket.instances).toHaveLength(1);
  });

  it("restarts cleanly after a stop (StrictMode mount/unmount/mount)", async () => {
    client.start();
    client.stop();
    client.start();
    await flush();

    expect(FakeSocket.instances).toHaveLength(1);
    FakeSocket.last().ready();
    expect(client.getStatus()).toBe("online");
  });

  it("ignores events from a socket that was replaced", async () => {
    client.start();
    await flush();
    const first = FakeSocket.last();
    first.ready();
    first.serverClose(1006);
    await vi.advanceTimersByTimeAsync(1_000);

    const eventsBefore = events.length;
    first.receive({ type: "pong", serverTime: "x" });
    expect(events).toHaveLength(eventsBefore);
  });

  it("nudge() reconnects right away instead of waiting for the backoff", async () => {
    client.start();
    await flush();
    FakeSocket.last().serverClose(1006);
    expect(FakeSocket.instances).toHaveLength(1);

    client.nudge();
    await flush();
    expect(FakeSocket.instances).toHaveLength(2);
  });
});
