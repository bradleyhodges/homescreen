import { describe, expect, it } from "vitest";
import { capitalize, cn } from "./utils";

describe("shared utilities", () => {
    it("merges conditional classes and conflicting Tailwind utilities", () => {
        expect(
            cn(
                "px-2 text-sm",
                false && "hidden",
                { "font-medium": true },
                "px-4",
            ),
        ).toBe("text-sm font-medium px-4");
    });
    it("handles empty and mixed-case labels", () => {
        expect(capitalize("")).toBe("");
        expect(capitalize("home Assistant")).toBe("Home Assistant");
    });
});
