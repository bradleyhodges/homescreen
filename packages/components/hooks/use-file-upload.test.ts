// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { createElement, type ReactNode, StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useFileUpload } from "./use-file-upload";

beforeEach(() => {
    let next = 0;
    vi.stubGlobal("URL", {
        createObjectURL: vi.fn(() => `blob:${++next}`),
        revokeObjectURL: vi.fn(),
    });
});
afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
});

describe("useFileUpload", () => {
    it("releases non-image previews on removal, replacement, clear and unmount", () => {
        const { result, unmount } = renderHook(() => useFileUpload());
        const file = new File(["text"], "report.txt", { type: "text/plain" });
        act(() => result.current[1].addFiles([file]));
        act(() => result.current[1].addFiles([file]));
        expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:1");
        const uploaded = result.current[0].files[0];
        if (!uploaded) throw new Error("Expected the uploaded file.");
        act(() => result.current[1].removeFile(uploaded.id));
        expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:2");
        act(() => result.current[1].addFiles([file]));
        act(() => result.current[1].clearFiles());
        expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:3");
        act(() => result.current[1].addFiles([file]));
        unmount();
        expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:4");
        expect(URL.revokeObjectURL).toHaveBeenCalledTimes(4);
    });

    it("preserves the previous file when a replacement fails validation", () => {
        const { result } = renderHook(() => useFileUpload({ accept: ".txt" }));
        act(() => result.current[1].addFiles([new File(["ok"], "report.txt")]));
        act(() => result.current[1].addFiles([new File(["bad"], "image.png")]));
        expect(result.current[0].files[0]?.file.name).toBe("report.txt");
        expect(result.current[0].errors).toHaveLength(1);
        expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    });

    it("deduplicates batches and enforces limits across batched actions without duplicate callbacks", () => {
        const onFilesChange = vi.fn();
        const { result } = renderHook(
            () => useFileUpload({ multiple: true, maxFiles: 2, onFilesChange }),
            {
                wrapper: ({ children }: { children: ReactNode }) =>
                    createElement(StrictMode, null, children),
            },
        );
        const file = new File(["a"], "a.txt");
        act(() => {
            result.current[1].addFiles([file, file]);
            result.current[1].addFiles([
                new File(["b"], "b.txt"),
                new File(["c"], "c.txt"),
            ]);
        });
        expect(result.current[0].files.map((entry) => entry.file.name)).toEqual(
            ["a.txt", "b.txt"],
        );
        expect(result.current[0].errors).toHaveLength(1);
        expect(onFilesChange).toHaveBeenCalledTimes(2);
    });

    it("never revokes initial URLs owned by the caller", () => {
        const { result, unmount } = renderHook(() =>
            useFileUpload({
                initialFiles: [
                    {
                        name: "x",
                        type: "text/plain",
                        size: 1,
                        id: "x",
                        url: "blob:external",
                    },
                ],
            }),
        );
        act(() => result.current[1].clearFiles());
        unmount();
        expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    });
});
