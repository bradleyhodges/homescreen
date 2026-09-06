import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createHassClient } from "./client";
import { INSTANCE_KEY, NONCE_KEY, TOKEN_KEY } from "./storage";

// Keep the real SDK getAuth/Connection; only the browser network boundary is simulated.
class HomeAssistantSocket extends EventTarget {
  static instances: HomeAssistantSocket[] = [];
  static authenticate = true;
  OPEN = 1;
  readyState = 0;
  constructor() {
    super();
    HomeAssistantSocket.instances.push(this);
    queueMicrotask(() => {
      if (this.readyState === 3) return;
      this.readyState = 1;
      this.dispatchEvent(new Event("open"));
      if (HomeAssistantSocket.authenticate)
        this.receive({ type: "auth_ok", ha_version: "2026.9.0" });
    });
  }
  receive(value: unknown) {
    if (this.readyState === 1)
      this.dispatchEvent(
        new MessageEvent("message", { data: JSON.stringify(value) }),
      );
  }
  send(raw: string) {
    const message = JSON.parse(raw) as { id: number; type: string };
    if (message.type === "subscribe_entities")
      queueMicrotask(() => {
        this.receive({ id: message.id, type: "result", success: true });
        this.receive({ id: message.id, type: "event", event: { a: {} } });
      });
  }
  close() {
    if (this.readyState === 3) return;
    this.readyState = 3;
    this.dispatchEvent(new Event("close"));
  }
}
const hassUrl = "http://home.example:8123";
function tokens() {
  sessionStorage.setItem(
    TOKEN_KEY,
    JSON.stringify({
      hassUrl,
      clientId: `${location.origin}/`,
      access_token: "existing",
      refresh_token: "refresh",
      expires: Date.now() + 3_600_000,
      expires_in: 3600,
    }),
  );
}
function callback(path: string, nonce = "attacker") {
  const state = btoa(
    JSON.stringify({ hassUrl, clientId: `${location.origin}/` }),
  );
  history.replaceState(
    null,
    "",
    `${path}?auth_callback=1&code=one-use&state=${encodeURIComponent(state)}&nonce=${nonce}`,
  );
}
beforeEach(() => {
  HomeAssistantSocket.instances = [];
  HomeAssistantSocket.authenticate = true;
  vi.stubGlobal("WebSocket", HomeAssistantSocket);
  vi.stubGlobal("fetch", vi.fn());
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  for (const key of [TOKEN_KEY, INSTANCE_KEY, NONCE_KEY])
    sessionStorage.removeItem(key);
  history.replaceState(null, "", "/");
});

it.each(["handshaking", "authenticated"])(
  "closes a real SDK reconnect socket when disconnect occurs while %s",
  async (phase) => {
    tokens();
    const client = createHassClient();
    await client.store.getState().connect(hassUrl);
    await vi.waitFor(() =>
      expect(client.store.getState().status).toBe("connected"),
    );
    vi.useFakeTimers();
    HomeAssistantSocket.authenticate = false;
    HomeAssistantSocket.instances[0]?.close();
    await vi.advanceTimersByTimeAsync(0);
    const reconnect = HomeAssistantSocket.instances[1];
    expect(reconnect).toBeDefined();
    if (phase === "authenticated")
      reconnect?.receive({ type: "auth_ok", ha_version: "2026.9.0" });
    client.store.getState().disconnect();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(reconnect?.readyState).toBe(3);
    expect(HomeAssistantSocket.instances).toHaveLength(2);
    expect(client.store.getState().status).toBe("disconnected");
  },
);

it("rejects unsolicited OAuth parameters on the root route before real SDK token exchange", async () => {
  tokens();
  callback("/");
  const client = createHassClient();
  const release = client.retain();
  await vi.waitFor(() => expect(client.store.getState().status).toBe("error"));
  expect(fetch).not.toHaveBeenCalled();
  expect(location.search).toBe("");
  release();
  await Promise.resolve();
});

it("strips root-route callback parameters before manual connect invokes real SDK getAuth", async () => {
  tokens();
  callback("/");
  const client = createHassClient();
  await client.store.getState().connect(hassUrl);
  await vi.waitFor(() =>
    expect(client.store.getState().status).toBe("connected"),
  );
  expect(fetch).not.toHaveBeenCalled();
  expect(location.search).toBe("");
  client.store.getState().disconnect();
});

it("exchanges a validated one-use callback exactly once through real SDK auth under effect replay", async () => {
  sessionStorage.setItem(INSTANCE_KEY, hassUrl);
  sessionStorage.setItem(NONCE_KEY, "expected");
  callback("/auth", "expected");
  vi.mocked(fetch).mockResolvedValue(
    new Response(
      JSON.stringify({
        access_token: "new",
        refresh_token: "refresh",
        expires_in: 3600,
      }),
      { status: 200 },
    ),
  );
  const client = createHassClient();
  const release = client.retain();
  release();
  const finalRelease = client.retain();
  await vi.waitFor(() =>
    expect(client.store.getState().status).toBe("connected"),
  );
  expect(fetch).toHaveBeenCalledOnce();
  const body = vi.mocked(fetch).mock.calls[0]?.[1]?.body as FormData;
  expect(body.get("code")).toBe("one-use");
  expect(location.search).toBe("");
  finalRelease();
  await Promise.resolve();
});
