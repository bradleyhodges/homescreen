import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  Auth,
  Connection,
  HassEntities,
} from "home-assistant-js-websocket";
import { createHassClient, type BrowserEnvironment } from "./client";
import { INSTANCE_KEY, NONCE_KEY, TOKEN_KEY } from "./storage";

const sdk = vi.hoisted(() => ({
  getAuth: vi.fn(),
  createConnection: vi.fn(),
  subscribeEntities: vi.fn(),
  callService: vi.fn(),
}));
vi.mock("home-assistant-js-websocket", () => ({
  ...sdk,
  ERR_INVALID_AUTH: 2,
  ERR_CANNOT_CONNECT: 1,
  ERR_INVALID_AUTH_CALLBACK: 6,
}));
vi.mock("./entities", () => ({ subscribeEntityStream: sdk.subscribeEntities }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function connection() {
  const events = new Map<string, () => void>();
  const result = {
    connected: true,
    close: vi.fn(),
    addEventListener: vi.fn((event: string, callback: () => void) =>
      events.set(event, callback),
    ),
    removeEventListener: vi.fn((event: string) => events.delete(event)),
  };
  return {
    value: result as unknown as Connection,
    close: result.close,
    events,
  };
}
function environment() {
  const values = new Map<string, string>();
  const env: BrowserEnvironment = {
    url: new URL("https://app.example/"),
    storage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => {
        values.set(key, value);
      },
      removeItem: (key) => {
        values.delete(key);
      },
    },
    replaceUrl: vi.fn(),
    randomNonce: () => "nonce",
  };
  return { env, values };
}
const auth = { revoke: vi.fn() } as unknown as Auth;
beforeEach(() => {
  vi.clearAllMocks();
  sdk.getAuth.mockResolvedValue(auth);
  sdk.subscribeEntities.mockImplementation(
    (_connection: Connection, callback: (entities: HassEntities) => void) => {
      callback({});
      return vi.fn();
    },
  );
});
afterEach(() => {
  vi.useRealTimers();
});

describe("connection ownership", () => {
  it("treats a plain auth route as an ordinary disconnected page", async () => {
    const { env } = environment();
    env.url = new URL("https://app.example/auth");
    const client = createHassClient(() => env);
    const release = client.retain();
    await Promise.resolve();
    expect(client.store.getState().status).toBe("disconnected");
    expect(client.store.getState().error).toBeNull();
    expect(sdk.getAuth).not.toHaveBeenCalled();
    release();
  });
  it("clears the reconnect watchdog after the SDK resubscription snapshot, even with no further changes", async () => {
    vi.useFakeTimers();
    const conn = connection();
    sdk.createConnection.mockResolvedValue(conn.value);
    let emit!: (entities: HassEntities) => void;
    sdk.subscribeEntities.mockImplementationOnce(
      (_conn: Connection, callback: typeof emit) => {
        emit = callback;
        callback({});
        return vi.fn();
      },
    );
    const { env } = environment();
    const client = createHassClient(() => env);
    await client.store.getState().connect("https://home.example");
    conn.events.get("disconnected")?.();
    // SDK _setSocket sends resubscribe, then fires ready synchronously. The server snapshot arrives later.
    conn.events.get("ready")?.();
    await vi.advanceTimersByTimeAsync(100);
    emit({});
    await vi.advanceTimersByTimeAsync(60_000);
    expect(client.store.getState().status).toBe("connected");
    client.store.getState().disconnect();
  });
  it("cannot clear a new session when an old logout revocation finishes late", async () => {
    const revoke = deferred<void>();
    sdk.getAuth.mockResolvedValueOnce({ revoke: () => revoke.promise });
    sdk.createConnection.mockImplementation(async () => connection().value);
    const { env, values } = environment();
    const client = createHassClient(() => env);
    await client.store.getState().connect("https://first.example");
    const logout = client.store.getState().logout();
    await client.store.getState().connect("https://second.example");
    const oldOptions = sdk.getAuth.mock.calls[0]?.[0] as {
      saveTokens: (value: null) => void;
    };
    values.set(TOKEN_KEY, "new tokens");
    oldOptions.saveTokens(null);
    revoke.resolve();
    await logout;
    expect(values.get(TOKEN_KEY)).toBe("new tokens");
    expect(client.store.getState().status).toBe("connected");
    client.store.getState().disconnect();
  });
  it("bounds a socket attempt and closes a socket that arrives after timeout", async () => {
    vi.useFakeTimers();
    const pending = deferred<Connection>();
    const conn = connection();
    sdk.createConnection.mockReturnValue(pending.promise);
    const { env } = environment();
    const client = createHassClient(() => env);
    const attempt = client.store.getState().connect("https://home.example");
    await vi.advanceTimersByTimeAsync(30_001);
    await attempt;
    expect(client.store.getState().status).toBe("error");
    pending.resolve(conn.value);
    await Promise.resolve();
    expect(conn.close).toHaveBeenCalledOnce();
  });
  it("exposes a missing initial entity snapshot instead of staying empty indefinitely", async () => {
    vi.useFakeTimers();
    const conn = connection();
    sdk.createConnection.mockResolvedValue(conn.value);
    sdk.subscribeEntities.mockReturnValueOnce(vi.fn());
    const { env } = environment();
    const client = createHassClient(() => env);
    await client.store.getState().connect("https://home.example");
    await vi.advanceTimersByTimeAsync(30_001);
    expect(client.store.getState().error).toContain(
      "synchronization timed out",
    );
    expect(conn.close).toHaveBeenCalledOnce();
  });
  it("keeps an idle connection alive after a valid empty entity snapshot", async () => {
    vi.useFakeTimers();
    const conn = connection();
    sdk.createConnection.mockResolvedValue(conn.value);
    sdk.subscribeEntities.mockImplementationOnce(
      (_conn: Connection, callback: (entities: HassEntities) => void) => {
        callback({});
        return vi.fn();
      },
    );
    const { env } = environment();
    const client = createHassClient(() => env);
    await client.store.getState().connect("https://home.example");
    await vi.advanceTimersByTimeAsync(60_001);
    expect(client.store.getState().status).toBe("connected");
    client.store.getState().disconnect();
  });
  it("closes a connection that arrives after disconnect", async () => {
    const pending = deferred<Connection>();
    const conn = connection();
    sdk.createConnection.mockReturnValue(pending.promise);
    const { env } = environment();
    const client = createHassClient(() => env);
    const attempt = client.store.getState().connect("https://home.example");
    await vi.waitFor(() => expect(sdk.createConnection).toHaveBeenCalledOnce());
    client.store.getState().disconnect();
    pending.resolve(conn.value);
    await attempt;
    expect(conn.close).toHaveBeenCalledOnce();
    expect(client.store.getState().status).toBe("disconnected");
    expect(sdk.subscribeEntities).not.toHaveBeenCalled();
  });
  it("ignores stale token saves after logout", async () => {
    const pending = deferred<Auth>();
    sdk.getAuth.mockReturnValue(pending.promise);
    const { env, values } = environment();
    const client = createHassClient(() => env);
    const attempt = client.store.getState().connect("https://home.example");
    await vi.waitFor(() => expect(sdk.getAuth).toHaveBeenCalledOnce());
    const options = sdk.getAuth.mock.calls[0]?.[0] as {
      saveTokens: (tokens: object) => void;
    };
    await client.store.getState().logout();
    options.saveTokens({ access_token: "late" });
    pending.resolve(auth);
    await attempt;
    expect(values.has(TOKEN_KEY)).toBe(false);
    expect(sdk.createConnection).not.toHaveBeenCalled();
  });
  it("uses SDK reconnect and cleans listeners/subscription exactly once", async () => {
    const conn = connection();
    sdk.createConnection.mockResolvedValue(conn.value);
    const unsubscribe = vi.fn();
    sdk.subscribeEntities.mockImplementationOnce(
      (_connection: Connection, callback: (entities: HassEntities) => void) => {
        callback({});
        return unsubscribe;
      },
    );
    const { env } = environment();
    const client = createHassClient(() => env);
    await client.store.getState().connect("https://home.example");
    conn.events.get("disconnected")?.();
    expect(client.store.getState().status).toBe("reconnecting");
    conn.events.get("ready")?.();
    expect(client.store.getState().status).toBe("reconnecting");
    const emit = sdk.subscribeEntities.mock.calls[0]?.[1] as (
      entities: HassEntities,
    ) => void;
    emit({});
    expect(client.store.getState().status).toBe("connected");
    expect(sdk.createConnection).toHaveBeenCalledOnce();
    client.store.getState().disconnect();
    client.store.getState().disconnect();
    expect(unsubscribe).toHaveBeenCalledOnce();
    expect(conn.close).toHaveBeenCalledOnce();
    expect(conn.events.size).toBe(0);
  });
  it("does not repeat an OAuth callback during StrictMode effect replay", async () => {
    const { env, values } = environment();
    env.url = new URL(
      "https://app.example/auth?auth_callback=1&code=one-use&state=sdk-state&nonce=nonce",
    );
    values.set(INSTANCE_KEY, "https://home.example");
    values.set(NONCE_KEY, "nonce");
    sdk.createConnection.mockResolvedValue(connection().value);
    const client = createHassClient(() => env);
    const release = client.retain();
    release();
    const releaseAgain = client.retain();
    await vi.waitFor(() =>
      expect(client.store.getState().status).toBe("connected"),
    );
    expect(sdk.getAuth).toHaveBeenCalledOnce();
    expect(env.replaceUrl).toHaveBeenCalledWith("/auth");
    releaseAgain();
    await Promise.resolve();
  });
  it("rejects unsolicited OAuth callbacks before sending the code", async () => {
    const { env } = environment();
    env.url = new URL(
      "https://app.example/auth?auth_callback=1&code=stolen&nonce=wrong",
    );
    const client = createHassClient(() => env);
    const release = client.retain();
    await vi.waitFor(() =>
      expect(client.store.getState().status).toBe("error"),
    );
    expect(sdk.getAuth).not.toHaveBeenCalled();
    expect(env.replaceUrl).toHaveBeenCalledWith("/auth");
    release();
  });
  it("exposes authentication errors without leaking raw SDK error details", async () => {
    sdk.getAuth.mockRejectedValue(new Error("secret token or internal host"));
    const { env } = environment();
    const client = createHassClient(() => env);
    await client.store.getState().connect("https://home.example");
    expect(client.store.getState().status).toBe("error");
    expect(client.store.getState().error).not.toContain("secret");
  });
  it("ignores late entity callbacks from a disconnected subscription", async () => {
    sdk.createConnection.mockResolvedValue(connection().value);
    const { env } = environment();
    const client = createHassClient(() => env);
    await client.store.getState().connect("https://home.example");
    const callback = sdk.subscribeEntities.mock.calls[0]?.[1] as (
      entities: HassEntities,
    ) => void;
    client.store.getState().disconnect();
    callback({
      "sensor.late": {
        entity_id: "sensor.late",
        state: "on",
        attributes: {},
        last_changed: "",
        last_updated: "",
        context: { id: "", parent_id: null, user_id: null },
      },
    });
    expect(client.store.getState().entities).toEqual({});
  });
  it("never automatically retries a failed service command or queues it while disconnected", async () => {
    sdk.createConnection.mockResolvedValue(connection().value);
    sdk.callService.mockRejectedValue(new Error("network"));
    const { env } = environment();
    const client = createHassClient(() => env);
    await expect(
      client.store.getState().callService("light", "turn_on"),
    ).rejects.toThrow("Connect");
    await client.store.getState().connect("https://home.example");
    await expect(
      client.store.getState().callService("light", "turn_on"),
    ).rejects.toThrow("Confirm");
    expect(sdk.callService).toHaveBeenCalledOnce();
  });
});
