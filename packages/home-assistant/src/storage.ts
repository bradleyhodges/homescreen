import type { AuthData } from "home-assistant-js-websocket";

export const TOKEN_KEY = "homescreen.hass.tokens.v1";
export const INSTANCE_KEY = "homescreen.hass.instance.v1";
export const NONCE_KEY = "homescreen.hass.oauth-nonce.v1";

export type SessionStorage = Pick<
    Storage,
    "getItem" | "setItem" | "removeItem"
>;

/** Home Assistant is connected directly from the browser; require an unambiguous origin. */
export function normalizeInstanceUrl(
    value: string,
    pageProtocol: string,
): string {
    let url: URL;
    try {
        url = new URL(value.trim());
    } catch {
        throw new Error(
            "Enter a complete Home Assistant URL, including http:// or https://.",
        );
    }
    if (
        !["http:", "https:"].includes(url.protocol) ||
        url.username ||
        url.password ||
        url.search ||
        url.hash ||
        url.pathname !== "/"
    ) {
        throw new Error(
            "Use your Home Assistant origin without credentials, a path, query, or fragment.",
        );
    }
    if (pageProtocol === "https:" && url.protocol !== "https:") {
        throw new Error(
            "This HTTPS app requires an HTTPS Home Assistant URL. Use a secure remote URL or run the app locally over HTTP.",
        );
    }
    return url.origin;
}

/** Token persistence is confined to this app's session key; expired tokens remain refreshable. */
export function createTokenStorage(
    storage: SessionStorage,
    protocol: string,
    clientId: string,
) {
    return {
        async load(): Promise<AuthData | undefined> {
            let raw: string | null;
            try {
                raw = storage.getItem(TOKEN_KEY);
            } catch {
                throw new Error(
                    "Browser session storage is unavailable. Allow storage to connect.",
                );
            }
            if (!raw) return undefined;
            try {
                const data: unknown = JSON.parse(raw);
                if (typeof data !== "object" || data === null)
                    throw new Error();
                const token = data as Record<string, unknown>;
                if (
                    typeof token.hassUrl !== "string" ||
                    normalizeInstanceUrl(token.hassUrl, protocol) !==
                        token.hassUrl ||
                    token.clientId !== clientId ||
                    typeof token.access_token !== "string" ||
                    !token.access_token ||
                    typeof token.refresh_token !== "string" ||
                    !token.refresh_token ||
                    typeof token.expires !== "number" ||
                    !Number.isFinite(token.expires) ||
                    typeof token.expires_in !== "number" ||
                    !Number.isFinite(token.expires_in) ||
                    token.expires_in <= 0
                )
                    throw new Error();
                return {
                    hassUrl: token.hassUrl,
                    clientId,
                    access_token: token.access_token,
                    refresh_token: token.refresh_token,
                    expires: token.expires,
                    expires_in: token.expires_in,
                };
            } catch {
                storage.removeItem(TOKEN_KEY);
                return undefined;
            }
        },
        save(data: AuthData | null): void {
            try {
                if (data) storage.setItem(TOKEN_KEY, JSON.stringify(data));
                else storage.removeItem(TOKEN_KEY);
            } catch {
                throw new Error(
                    "Browser session storage is unavailable. Allow storage to connect.",
                );
            }
        },
    };
}
