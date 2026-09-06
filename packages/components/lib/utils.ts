// Re-export the utility used by the current shadcn registry for one merge implementation.
export { cn } from "cn";

/** Capitalize the first character without changing the rest of a label. */
export function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
