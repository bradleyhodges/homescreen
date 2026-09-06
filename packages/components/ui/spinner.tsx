"use client";

import { sfArrowTrianglehead2ClockwiseRotate90 } from "@bradleyhodges/sfsymbols";
import { SFIcon } from "@bradleyhodges/sfsymbols-react";
import { cn } from "@repo/components/lib/utils";

function Spinner({ className, ...props }: React.ComponentProps<"svg">) {
    return (
        <SFIcon
            icon={sfArrowTrianglehead2ClockwiseRotate90}
            size={16}
            data-slot="spinner"
            role="status"
            aria-label="Loading"
            className={cn("size-4 animate-spin", className)}
            {...props}
        />
    );
}

export { Spinner };
