import localFont from "next/font/local";

export const FSMe = localFont({
    src: [
        {
            path: "./FSMe-Heavy.otf",
            weight: "700",
            style: "normal",
        },
        {
            path: "./FSMe-HeavyItalic.otf",
            weight: "700",
            style: "italic",
        },
        {
            path: "./FSMe-Bold.otf",
            weight: "600",
            style: "normal",
        },
        {
            path: "./FSMe-BoldItalic.otf",
            weight: "600",
            style: "italic",
        },
        {
            path: "./FSMe-Regular.otf",
            weight: "400",
            style: "normal",
        },
        {
            path: "./FSMe-Italic.otf",
            weight: "400",
            style: "italic",
        },
        {
            path: "./FSMe-Light.otf",
            weight: "200",
            style: "normal",
        },
        {
            path: "./FSMe-LightItalic.otf",
            weight: "200",
            style: "italic",
        },
    ],
    display: "swap",
    variable: "--font-fs-me",
});
