import { describe, expect, it } from "vitest";
import { createTokenStorage, normalizeInstanceUrl, TOKEN_KEY } from "./storage";

function storage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  };
}
const tokens = {
  hassUrl: "https://home.example",
  clientId: "https://app.example/",
  access_token: "access",
  refresh_token: "refresh",
  expires: 1,
  expires_in: 1800,
};

describe("browser credential storage", () => {
  it("loads expired valid tokens for SDK refresh", async () => {
    const data = storage();
    data.setItem(TOKEN_KEY, JSON.stringify(tokens));
    expect(
      await createTokenStorage(data, "https:", "https://app.example/").load(),
    ).toEqual(tokens);
  });
  it.each([
    "{",
    "null",
    JSON.stringify({ ...tokens, hassUrl: "javascript:alert(1)" }),
    JSON.stringify({ ...tokens, refresh_token: 12 }),
    JSON.stringify({ ...tokens, clientId: "https://other.example/" }),
  ])("rejects malformed or mismatched credentials", async (value) => {
    const data = storage();
    data.setItem(TOKEN_KEY, value);
    data.setItem("unrelated", "keep");
    expect(
      await createTokenStorage(data, "https:", "https://app.example/").load(),
    ).toBeUndefined();
    expect(data.getItem(TOKEN_KEY)).toBeNull();
    expect(data.getItem("unrelated")).toBe("keep");
  });
  it("reports unavailable storage instead of silently losing OAuth credentials", () => {
    const data = storage();
    data.setItem = () => {
      throw new Error("blocked");
    };
    expect(() =>
      createTokenStorage(data, "https:", "https://app.example/").save(tokens),
    ).toThrow("Browser session storage is unavailable");
  });
});

describe("instance URLs", () => {
  it("normalizes a browser-reachable origin", () => {
    expect(normalizeInstanceUrl(" http://home.local:8123/ ", "http:")).toBe(
      "http://home.local:8123",
    );
  });
  it.each([
    "ftp://home.local",
    "https://user:pass@home.local",
    "https://home.local/path",
    "https://home.local?token=secret",
    "http://home.local",
    "http://localhost:8123",
    "bad",
  ])("rejects unsafe or ambiguous URLs: %s", (url) => {
    expect(() => normalizeInstanceUrl(url, "https:")).toThrow();
  });
});
