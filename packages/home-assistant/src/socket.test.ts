import {
  Connection,
  ERR_CONNECTION_LOST,
  type Auth,
  type HaWebSocket,
} from "home-assistant-js-websocket";
import { afterEach, expect, it, vi } from "vitest";
import { openSocket } from "./socket";

class Socket extends EventTarget {
  OPEN = 1;
  readyState = 0;
  haVersion = "2026.9.0";
  send = vi.fn();
  close = vi.fn(() => {
    this.readyState = 3;
    this.dispatchEvent(new Event("close"));
  });
  open() {
    this.readyState = 1;
    this.dispatchEvent(new Event("open"));
  }
  receive(message: unknown) {
    this.dispatchEvent(
      new MessageEvent("message", { data: JSON.stringify(message) }),
    );
  }
  asWebSocket() {
    return this as unknown as HaWebSocket;
  }
}
const auth = {
  expired: false,
  wsUrl: "wss://home.example/api/websocket",
  accessToken: "test",
} as Auth;
afterEach(() => {
  vi.useRealTimers();
});

it("closes a raw socket whose server never completes authentication", async () => {
  vi.useFakeTimers();
  const socket = new Socket();
  const pending = openSocket({ auth }, new AbortController().signal, () =>
    socket.asWebSocket(),
  );
  const result = expect(pending).rejects.toBeDefined();
  socket.open();
  await vi.advanceTimersByTimeAsync(30_001);
  await result;
  expect(socket.close).toHaveBeenCalledOnce();
});

it("does not let the real SDK reconnect adopt a socket after disconnect", async () => {
  vi.useFakeTimers();
  const first = new Socket();
  first.open();
  const late = new Socket();
  const controller = new AbortController();
  const factory = vi.fn(() =>
    openSocket({ auth }, controller.signal, () => late.asWebSocket()),
  );
  const conn = new Connection(first.asWebSocket(), {
    auth,
    setupRetry: 0,
    createSocket: factory,
  });
  first.close();
  await vi.advanceTimersByTimeAsync(0);
  late.open();
  controller.abort();
  conn.close();
  late.receive({ type: "auth_ok", ha_version: "2026.9.0" });
  await vi.advanceTimersByTimeAsync(2_000);
  expect(late.close).toHaveBeenCalledOnce();
  expect(conn.connected).toBe(false);
  expect(factory).toHaveBeenCalledOnce();
});

it("uses the Home Assistant auth and supported-features handshake", async () => {
  const socket = new Socket();
  const pending = openSocket({ auth }, new AbortController().signal, () =>
    socket.asWebSocket(),
  );
  socket.open();
  socket.receive({ type: "auth_required" });
  socket.receive({ type: "auth_ok", ha_version: "2026.9.0" });
  expect(await pending).toBe(socket);
  expect(
    socket.send.mock.calls.map(([value]) => JSON.parse(value as string)),
  ).toEqual([
    { type: "auth", access_token: "test" },
    { id: 1, type: "supported_features", features: { coalesce_messages: 1 } },
  ]);
});

it("does not construct a socket after cancellation", async () => {
  const controller = new AbortController();
  controller.abort();
  const factory = vi.fn();
  await expect(openSocket({ auth }, controller.signal, factory)).rejects.toBe(
    ERR_CONNECTION_LOST,
  );
  expect(factory).not.toHaveBeenCalled();
});
