import {
  callService as sdkCallService,
  createConnection,
  ERR_INVALID_AUTH,
  ERR_INVALID_AUTH_CALLBACK,
  ERR_CONNECTION_LOST,
  getAuth,
  type Auth,
  type Connection,
  type HassEntities,
  type HassServiceTarget,
} from "home-assistant-js-websocket";
import { createStore } from "zustand/vanilla";
import {
  createTokenStorage,
  INSTANCE_KEY,
  NONCE_KEY,
  normalizeInstanceUrl,
  type SessionStorage,
} from "./storage";
import { withTimeout } from "./timeout";
import { openSocket } from "./socket";
import { subscribeEntityStream } from "./entities";

const OAUTH_PARAMETERS = [
  "auth_callback",
  "code",
  "state",
  "nonce",
  "error",
  "error_description",
];
function hasOAuthParameters(url: URL) {
  return OAUTH_PARAMETERS.some((key) => url.searchParams.has(key));
}
function removeOAuthParameters(env: BrowserEnvironment) {
  const clean = new URL(env.url);
  for (const key of OAUTH_PARAMETERS) clean.searchParams.delete(key);
  env.replaceUrl(`${clean.pathname}${clean.search}${clean.hash}`);
}

export type HassStatus =
  "disconnected" | "connecting" | "connected" | "reconnecting" | "error";
export interface HassState {
  status: HassStatus;
  error: string | null;
  instanceUrl: string | null;
  entities: HassEntities;
  connect: (url: string) => Promise<void>;
  retry: () => Promise<void>;
  disconnect: () => void;
  logout: () => Promise<void>;
  callService: (
    domain: string,
    service: string,
    data?: Record<string, unknown>,
    target?: HassServiceTarget,
  ) => Promise<unknown>;
}

export interface BrowserEnvironment {
  url: URL;
  storage: SessionStorage;
  replaceUrl: (url: string) => void;
  randomNonce: () => string;
}
function browserEnvironment(): BrowserEnvironment {
  return {
    url: new URL(window.location.href),
    storage: window.sessionStorage,
    replaceUrl: (url) => window.history.replaceState(null, "", url),
    randomNonce: () =>
      Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) =>
        byte.toString(16).padStart(2, "0"),
      ).join(""),
  };
}
function connectionError(error: unknown): string {
  if (error === ERR_INVALID_AUTH)
    return "Home Assistant rejected your credentials. Log out and connect again.";
  if (error === ERR_INVALID_AUTH_CALLBACK)
    return "The authentication callback does not match this session. Connect again.";
  return "Could not connect to Home Assistant. Check the instance URL, network access, and browser console for connection diagnostics, then retry.";
}

/** Own one browser connection. SDK manages reconnects; generations reject stale async work. */
export function createHassClient(
  environment: () => BrowserEnvironment = browserEnvironment,
) {
  let generation = 0;
  let owners = 0;
  let started = false;
  let auth: Auth | undefined;
  let connection: Connection | undefined;
  let cleanup: (() => void) | undefined;
  let attemptAbort: AbortController | undefined;

  function close() {
    generation += 1;
    attemptAbort?.abort();
    attemptAbort = undefined;
    cleanup?.();
    cleanup = undefined;
    connection?.close();
    connection = undefined;
  }
  function disconnect() {
    close();
    store.setState({ status: "disconnected", error: null, entities: {} });
  }
  async function establish(
    url: string,
    env: BrowserEnvironment,
    callback = false,
  ) {
    close();
    auth = undefined;
    const current = generation;
    const isCurrent = () => generation === current;
    const abort = new AbortController();
    attemptAbort = abort;
    const tokenStorage = createTokenStorage(
      env.storage,
      env.url.protocol,
      `${env.url.origin}/`,
    );
    store.setState({
      status: "connecting",
      error: null,
      instanceUrl: url,
      entities: {},
    });
    try {
      env.storage.setItem(INSTANCE_KEY, url);
      const nonce = callback
        ? env.storage.getItem(NONCE_KEY)
        : env.randomNonce();
      if (!callback && nonce) env.storage.setItem(NONCE_KEY, nonce);
      if (callback) env.storage.removeItem(NONCE_KEY);
      const authRequest = getAuth({
        hassUrl: url,
        clientId: `${env.url.origin}/`,
        limitHassInstance: true,
        redirectUrl: `${env.url.origin}/auth?nonce=${encodeURIComponent(nonce ?? "")}`,
        loadTokens: tokenStorage.load,
        saveTokens: (data) => {
          if (isCurrent()) tokenStorage.save(data);
        },
      });
      // SDK reads the callback synchronously before its first await; remove the code promptly.
      if (callback) removeOAuthParameters(env);
      const nextAuth = await withTimeout(authRequest);
      if (!isCurrent()) return;
      auth = nextAuth;
      env.storage.removeItem(NONCE_KEY);
      const nextConnection = await withTimeout(
        createConnection({
          auth: nextAuth,
          setupRetry: 0,
          createSocket: async (options) => {
            const socket = await openSocket(options, abort.signal);
            if (!isCurrent()) {
              socket.close();
              throw ERR_CONNECTION_LOST;
            }
            return socket;
          },
        }).then((created) => {
          // A socket can finish opening after a timeout or explicit disconnect.
          if (!isCurrent()) created.close();
          return created;
        }),
      );
      if (!isCurrent()) {
        return;
      }
      connection = nextConnection;
      let syncTimer: ReturnType<typeof setTimeout> | undefined;
      const ready = () => {
        if (!isCurrent()) return;
        clearTimeout(syncTimer);
        syncTimer = setTimeout(() => {
          if (!isCurrent()) return;
          close();
          store.setState({
            status: "error",
            error:
              "Home Assistant connected but entity synchronization timed out. Check permissions and retry.",
            entities: {},
          });
        }, 30_000);
        store.setState({
          status:
            store.getState().status === "reconnecting"
              ? "reconnecting"
              : "connecting",
          error: null,
        });
      };
      const disconnected = () => {
        clearTimeout(syncTimer);
        if (isCurrent()) store.setState({ status: "reconnecting" });
      };
      const reconnectError = (_connection: Connection, error?: unknown) => {
        if (!isCurrent()) return;
        if (error === ERR_INVALID_AUTH) {
          close();
          store.setState({
            status: "error",
            error: connectionError(error),
            entities: {},
          });
        } else
          store.setState({
            status: "reconnecting",
            error:
              "Connection interrupted. Home Assistant is reconnecting automatically.",
          });
      };
      nextConnection.addEventListener("ready", ready);
      nextConnection.addEventListener("disconnected", disconnected);
      nextConnection.addEventListener("reconnect-error", reconnectError);
      const removeListeners = () => {
        clearTimeout(syncTimer);
        nextConnection.removeEventListener("ready", ready);
        nextConnection.removeEventListener("disconnected", disconnected);
        nextConnection.removeEventListener("reconnect-error", reconnectError);
      };
      cleanup = removeListeners;
      ready();
      const unsubscribe = subscribeEntityStream(
        nextConnection,
        (entities) => {
          if (isCurrent()) {
            clearTimeout(syncTimer);
            store.setState({ entities, status: "connected", error: null });
          }
        },
        () => {
          if (!isCurrent()) return;
          close();
          store.setState({
            status: "error",
            error:
              "Home Assistant could not synchronize entities. Check permissions and retry.",
            entities: {},
          });
        },
      );
      cleanup = () => {
        removeListeners();
        unsubscribe();
      };
    } catch (error) {
      if (!isCurrent()) return;
      close();
      store.setState({
        status: "error",
        error: connectionError(error),
        entities: {},
      });
    } finally {
      if (callback) removeOAuthParameters(env);
    }
  }
  async function connect(value: string) {
    try {
      const env = environment();
      const url = normalizeInstanceUrl(value, env.url.protocol);
      // Manual retry must never replay an old OAuth code still in the address bar.
      if (hasOAuthParameters(env.url)) removeOAuthParameters(env);
      await establish(url, env);
    } catch (error) {
      close();
      store.setState({
        error:
          error instanceof Error
            ? error.message
            : "Browser session storage is unavailable.",
        status: "error",
      });
    }
  }
  async function start() {
    const current = generation;
    try {
      const env = environment();
      const callback = hasOAuthParameters(env.url);
      if (callback) {
        const url = env.storage.getItem(INSTANCE_KEY);
        const nonce = env.storage.getItem(NONCE_KEY);
        if (
          env.url.pathname !== "/auth" ||
          !url ||
          !nonce ||
          nonce !== env.url.searchParams.get("nonce") ||
          env.url.searchParams.get("auth_callback") !== "1" ||
          !env.url.searchParams.get("code") ||
          !env.url.searchParams.get("state")
        ) {
          removeOAuthParameters(env);
          env.storage.removeItem(NONCE_KEY);
          store.setState({
            status: "error",
            error:
              "Authentication was cancelled, expired, or opened outside this browser session. Connect again.",
          });
          return;
        }
        await establish(normalizeInstanceUrl(url, env.url.protocol), env, true);
        return;
      }
      const tokens = await createTokenStorage(
        env.storage,
        env.url.protocol,
        `${env.url.origin}/`,
      ).load();
      if (tokens && generation === current)
        await establish(tokens.hassUrl, env);
    } catch {
      if (generation === current)
        store.setState({
          status: "error",
          error:
            "Could not restore this browser session. Allow session storage and connect again.",
        });
    }
  }
  async function logout() {
    const previousAuth = auth;
    auth = undefined;
    disconnect();
    const current = generation;
    store.setState({ instanceUrl: null });
    try {
      const env = environment();
      createTokenStorage(
        env.storage,
        env.url.protocol,
        `${env.url.origin}/`,
      ).save(null);
      env.storage.removeItem(INSTANCE_KEY);
      env.storage.removeItem(NONCE_KEY);
      if (previousAuth) await withTimeout(previousAuth.revoke());
    } catch {
      if (generation === current)
        store.setState({
          error:
            "Signed out locally, but token revocation could not be confirmed. Remove the refresh token from your Home Assistant profile if needed.",
        });
    }
  }
  const store = createStore<HassState>(() => ({
    status: "disconnected",
    error: null,
    instanceUrl: null,
    entities: {},
    connect,
    disconnect,
    logout,
    retry: async () => {
      const url = store.getState().instanceUrl;
      if (url) await connect(url);
    },
    callService: async (domain, service, data, target) => {
      if (!connection?.connected || store.getState().status !== "connected")
        throw new Error("Connect to Home Assistant before calling a service.");
      if (!/^[a-z0-9_]+$/.test(domain) || !/^[a-z0-9_]+$/.test(service))
        throw new Error("Provide a valid service domain and name.");
      try {
        return await withTimeout(
          sdkCallService(connection, domain, service, data, target),
        );
      } catch {
        throw new Error(
          "The service result could not be confirmed. Confirm the device state before trying again.",
        );
      }
    },
  }));
  return {
    store,
    retain() {
      owners += 1;
      if (!started) {
        started = true;
        void start();
      }
      let released = false;
      return () => {
        if (released) return;
        released = true;
        owners -= 1;
        // React StrictMode reattaches effects in the same turn. Keep the one-use OAuth request alive.
        queueMicrotask(() => {
          if (owners === 0) {
            close();
            started = false;
          }
        });
      };
    },
  };
}
export type HassClient = ReturnType<typeof createHassClient>;
