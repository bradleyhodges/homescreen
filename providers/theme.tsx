import type { ThemeProviderProps } from "@teispace/next-themes";
import { ThemeProvider as NextThemeProvider } from "@teispace/next-themes";

export const ThemeProvider = ({
    children,
    ...properties
}: ThemeProviderProps) => (
    <NextThemeProvider
        {...properties}
        attribute="class"
        defaultTheme="light"
        enableSystem={false}
        forcedTheme="light"
        disableTransitionOnChange
    >
        {children}
    </NextThemeProvider>
);
