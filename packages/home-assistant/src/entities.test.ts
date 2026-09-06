import {
  Connection,
  type HaWebSocket,
  type HassEntities,
} from "home-assistant-js-websocket";
import { afterEach, expect, it, vi } from "vitest";
import { applyEntityUpdates, subscribeEntityStream } from "./entities";

class Socket extends EventTarget {
  OPEN = 1;
  readyState = 1;
  haVersion = "2026.9.0";
  sent: Array<{ id: number; type: string }> = [];
  send(raw: string) {
    this.sent.push(JSON.parse(raw) as { id: number; type: string });
  }
  close() {
    this.readyState = 3;
    this.dispatchEvent(new Event("close"));
  }
  receive(message: unknown) {
    this.dispatchEvent(
      new MessageEvent("message", { data: JSON.stringify(message) }),
    );
  }
  asWebSocket() {
    return this as unknown as HaWebSocket;
  }
  snapshot(additions: Record<string, unknown>) {
    const id = this.sent
      .filter((message) => message.type === "subscribe_entities")
      .at(-1)?.id;
    this.receive({ id, type: "result", success: true });
    this.receive({ id, type: "event", event: { a: additions } });
  }
}
const compressed = (state: string) => ({
  s: state,
  a: { friendly_name: "Test" },
  c: "context",
  lc: 1,
});
afterEach(() => {
  vi.useRealTimers();
});

it("applies compressed updates/removals while retaining unrelated entity references", () => {
  const first = applyEntityUpdates(
    {},
    { a: { "light.desk": compressed("off"), "sensor.temp": compressed("21") } },
    true,
  );
  const next = applyEntityUpdates(
    first,
    {
      c: {
        "light.desk": {
          "+": { s: "on", a: { brightness: 120 }, lu: 2 },
          "-": { a: ["friendly_name"] },
        },
      },
    },
    false,
  );
  expect(next["sensor.temp"]).toBe(first["sensor.temp"]);
  expect(next["light.desk"]?.attributes).toEqual({ brightness: 120 });
  expect(next["light.desk"]?.state).toBe("on");
  expect(first["light.desk"]?.state).toBe("off");
  expect(
    applyEntityUpdates(next, { r: ["light.desk"] }, false)["light.desk"],
  ).toBeUndefined();
});

it.each([
  null,
  { a: { "light.desk": { s: "on" } } },
  { c: { "light.missing": { "+": { s: "on" } } } },
  { r: [42] },
])("rejects invalid compressed protocol data", (value) => {
  expect(() => applyEntityUpdates({}, value, false)).toThrow();
});

it("replaces the full entity snapshot after real SDK reconnection, removing offline deletions", async () => {
  vi.useFakeTimers();
  const first = new Socket();
  const second = new Socket();
  const conn = new Connection(first.asWebSocket(), {
    setupRetry: 0,
    createSocket: async () => second.asWebSocket(),
  });
  const states: HassEntities[] = [];
  const fail = vi.fn();
  const stop = subscribeEntityStream(
    conn,
    (entities) => states.push(entities),
    fail,
  );
  first.snapshot({
    "light.kept": compressed("off"),
    "light.removed": compressed("off"),
  });
  await Promise.resolve();
  first.close();
  await vi.advanceTimersByTimeAsync(0);
  second.snapshot({ "light.kept": compressed("on") });
  await Promise.resolve();
  expect(Object.keys(states.at(-1) ?? {})).toEqual(["light.kept"]);
  expect(fail).not.toHaveBeenCalled();
  expect(
    second.sent.filter((message) => message.type === "subscribe_entities"),
  ).toHaveLength(1);
  stop();
  conn.close();
});

it("handles a rejected real SDK subscription through the error callback", async () => {
  const socket = new Socket();
  const conn = new Connection(socket.asWebSocket(), {
    setupRetry: 0,
    createSocket: async () => socket.asWebSocket(),
  });
  const fail = vi.fn();
  const stop = subscribeEntityStream(conn, vi.fn(), fail);
  socket.receive({
    id: socket.sent[0]?.id,
    type: "result",
    success: false,
    error: { code: "unauthorized", message: "Forbidden" },
  });
  await vi.waitFor(() => expect(fail).toHaveBeenCalledOnce());
  stop();
  conn.close();
});
