// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useCopyToClipboard } from "./use-copy-to-clipboard";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("useCopyToClipboard", () => {
  it("clears feedback timers on unmount", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("navigator", {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
    const { result, unmount } = renderHook(() => useCopyToClipboard());
    await act(() => result.current.copy("hello"));
    expect(result.current.state).toBe("done");
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("ignores clipboard completion after unmount", async () => {
    vi.useFakeTimers();
    let resolve!: () => void;
    vi.stubGlobal("navigator", {
      clipboard: {
        writeText: () =>
          new Promise<void>((done) => {
            resolve = done;
          }),
      },
    });
    const onCopySuccess = vi.fn();
    const { result, unmount } = renderHook(() =>
      useCopyToClipboard({ onCopySuccess }),
    );
    const pending = result.current.copy("hello");
    unmount();
    resolve();
    await pending;
    expect(onCopySuccess).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("keeps feedback from the latest operation when requests resolve out of order", async () => {
    const resolvers: Array<() => void> = [];
    vi.stubGlobal("navigator", {
      clipboard: {
        writeText: () => new Promise<void>((done) => resolvers.push(done)),
      },
    });
    const onCopySuccess = vi.fn();
    const { result } = renderHook(() => useCopyToClipboard({ onCopySuccess }));
    const first = result.current.copy("first");
    const second = result.current.copy("second");
    await act(async () => {
      resolvers[1]!();
      await second;
    });
    await act(async () => {
      resolvers[0]!();
      await first;
    });
    expect(onCopySuccess).toHaveBeenCalledExactlyOnceWith("second");
    expect(result.current.state).toBe("done");
  });
});
