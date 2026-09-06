import { parseError } from "@repo/observability/error";
import { toast } from "sonner";

export { cn } from "@bradleyhodges/swiss/tailwind";

export const capitalize = (str: string) =>
    str.charAt(0).toUpperCase() + str.slice(1);

export const handleError = (error: unknown): void => {
    const message = parseError(error);

    toast.error(message);
};
