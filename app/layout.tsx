import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Pixelify_Sans } from "next/font/google";
import { cookies } from "next/headers";
import { Suspense } from "react";

import NavHistory from "@/components/layout/NavHistory";
import NavProgress from "@/components/layout/NavProgress";
import { asLook, LOOK_COOKIE, lookAttrs } from "@/lib/appearance";
import { asTheme, THEME_COOKIE } from "@/lib/themes";

import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Only the hidden Blocks theme uses it, so it isn't preloaded.
const pixel = Pixelify_Sans({ variable: "--font-pixel", subsets: ["latin"], preload: false });

export const metadata: Metadata = {
  title: "Diastole",
  description: "Fitness is built between the beats. A coaching platform that reads recovery from Garmin and Apple Watch.",
};

// The browser's top bar matches the page background for the person's theme and background choice.
const CANVAS: Record<string, string> = { diastole: "#0d1513", ocean: "#0c1418", violet: "#110f18", mono: "#0e0f10", blocks: "#14120e", icarus: "#08182a" };
const BG: Record<string, string> = { midnight: "#0b0d10", black: "#000000", slate: "#0f1522", warm: "#15110c" };
const HUE: Record<string, number> = { sunset: 55, rose: 350, gold: 88 };

export async function generateViewport(): Promise<Viewport> {
  const jar = await cookies();
  const theme = asTheme(jar.get(THEME_COOKIE)?.value);
  const look = asLook(jar.get(LOOK_COOKIE)?.value);
  const hue = theme === "custom" ? look.hue : HUE[theme];
  const themeColor = BG[look.bg] ?? CANVAS[theme] ?? (hue !== undefined ? `oklch(17.5% 0.014 ${hue})` : "#0d1513");
  return { themeColor, viewportFit: "cover", colorScheme: "dark" };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const jar = await cookies();
  const theme = asTheme(jar.get(THEME_COOKIE)?.value);
  const look = asLook(jar.get(LOOK_COOKIE)?.value);
  return (
    <html
      lang="en"
      // The iOS app adds data-app="ios" before hydration.
      suppressHydrationWarning
      data-theme={theme}
      {...lookAttrs(look)}
      style={{ "--custom-h": look.hue } as React.CSSProperties}
      className={`${geistSans.variable} ${geistMono.variable} ${pixel.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Suspense fallback={null}>
          <NavHistory />
        <NavProgress />
        </Suspense>
        {children}
      </body>
    </html>
  );
}
