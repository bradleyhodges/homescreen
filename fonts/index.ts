import { cn } from "@bradleyhodges/swiss/tailwind";
import { GeistMono } from "geist/font/mono";
import { Caveat, Inter, Kalam } from "next/font/google";
import { AllianceNo1 } from "./alliance-full/font";
import { FSMe } from "./fs-me/font";
import { GalanoGrotesque } from "./galano-grotesque/font";
import { WALP } from "./walp/font";

const inter = Inter({
    subsets: ["latin"],
    variable: "--font-inter",
});

const kalam = Kalam({
    subsets: ["latin"],
    weight: ["300", "400", "700"],
    variable: "--font-kalam",
});

const caveat = Caveat({
    subsets: ["latin"],
    weight: ["500", "700"],
    variable: "--font-caveat",
});

export const fonts = cn(
    AllianceNo1.variable,
    "font-adelphi",
    GeistMono.variable,
    GalanoGrotesque.variable,
    FSMe.variable,
    kalam.variable,
    caveat.variable,
    WALP.variable,
    "touch-manipulation font-sans antialiased",
);

export const font = {
    GalanoGrotesque: {
        ...GalanoGrotesque,
        className: cn(GalanoGrotesque.className, "leading-[1.1]"),
    },
    GeistMono,
    inter,
    AdelphiPEVariable: {
        className: cn(
            "font-adelphi uppercase",
            "[font-variation-settings:'wght'_900,'opsz'_18,'slnt'_-9;]",
        ),
    },
    FSMe,
    Alliance: AllianceNo1,
    EuclidCircularB: AllianceNo1,
    WALP,
    kalam,
    caveat,
};
