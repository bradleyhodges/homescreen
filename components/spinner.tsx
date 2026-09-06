import { cn } from "@bradleyhodges/swiss/tailwind";

const Spinner = ({
    size = 24,
    weight = 2.5,
    className,
    "aria-label": ariaLabel,
    ...props
}: React.ComponentProps<"svg"> & {
    size?: number;
    weight?: number;
}) => {
    // Ensure size is an integer to avoid sub-pixel rendering issues
    const intSize = Math.round(size);

    return (
        <svg
            width={intSize}
            height={intSize}
            stroke="currentColor"
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
            className={cn("text-slate-500", className)}
            preserveAspectRatio="xMidYMid meet"
            style={{
                // Force crisp edges on supported browsers
                imageRendering: "crisp-edges",
                // Ensure proper scaling
                transform: "translateZ(0)",
            }}
            {...props}
        >
            <title>{ariaLabel || "Loading..."}</title>

            <g className="origin-center animate-spinner-part">
                <circle
                    cx="12"
                    cy="12"
                    r="9.5"
                    fill="none"
                    strokeWidth={weight}
                    className="animate-spinner-line rounded-full stroke-current"
                    style={{
                        strokeLinecap: "round",
                    }}
                />
            </g>
        </svg>
    );
};
Spinner.displayName = "Spinner";

export { Spinner };
