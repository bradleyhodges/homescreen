import {
  ERR_CANNOT_CONNECT,
  ERR_CONNECTION_LOST,
  ERR_INVALID_AUTH,
  type ConnectionOptions,
  type HaWebSocket,
} from "home-assistant-js-websocket";
import { withTimeout } from "./timeout";

/** An abortable Home Assistant 2022.9+ handshake; SDK Connection still owns reconnect/backoff. */
export function openSocket(
  options: Pick<ConnectionOptions, "auth">,
  signal: AbortSignal,
  construct: (url: string) => HaWebSocket = (url) =>
    new WebSocket(url) as HaWebSocket,
): Promise<HaWebSocket> {
  return new Promise((resolve, reject) => {
    const auth = options.auth;
    if (signal.aborted) {
      reject(ERR_CONNECTION_LOST);
      return;
    }
    if (!auth) {
      reject(ERR_INVALID_AUTH);
      return;
    }
    const credentials = auth;
    const socket = construct(auth.wsUrl);
    let settled = false;
    const timer = setTimeout(() => fail(ERR_CANNOT_CONNECT), 30_000);
    function detach() {
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      socket.removeEventListener("open", opened);
      socket.removeEventListener("message", message);
      socket.removeEventListener("close", closed);
      socket.removeEventListener("error", closed);
    }
    function fail(error: unknown) {
      if (settled) return;
      settled = true;
      detach();
      socket.close();
      reject(error);
    }
    function abort() {
      fail(ERR_CONNECTION_LOST);
    }
    function closed() {
      fail(ERR_CANNOT_CONNECT);
    }
    async function opened() {
      try {
        if (credentials.expired)
          await withTimeout(credentials.refreshAccessToken());
        if (!settled && !signal.aborted)
          socket.send(
            JSON.stringify({
              type: "auth",
              access_token: credentials.accessToken,
            }),
          );
      } catch (error) {
        fail(error);
      }
    }
    function message(event: MessageEvent) {
      try {
        const data: unknown = JSON.parse(String(event.data));
        if (typeof data !== "object" || data === null || !("type" in data))
          throw new Error("Invalid handshake");
        if (data.type === "auth_invalid") {
          fail(ERR_INVALID_AUTH);
          return;
        }
        if (data.type === "auth_required") return;
        if (
          data.type !== "auth_ok" ||
          !("ha_version" in data) ||
          typeof data.ha_version !== "string"
        )
          throw new Error("Invalid handshake");
        const [year, month] = data.ha_version.split(".").map(Number);
        if (
          year === undefined ||
          month === undefined ||
          !Number.isFinite(year) ||
          !Number.isFinite(month) ||
          year < 2022 ||
          (year === 2022 && month < 9)
        )
          throw new Error("Unsupported Home Assistant version");
        socket.haVersion = data.ha_version;
        socket.send(
          JSON.stringify({
            id: 1,
            type: "supported_features",
            features: { coalesce_messages: 1 },
          }),
        );
        settled = true;
        detach();
        resolve(socket);
      } catch {
        fail(ERR_CANNOT_CONNECT);
      }
    }
    socket.addEventListener("open", opened);
    socket.addEventListener("message", message);
    socket.addEventListener("close", closed);
    socket.addEventListener("error", closed);
    signal.addEventListener("abort", abort, { once: true });
  });
}
