import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Pixelify_Sans } from "next/font/google";
import { cookies } from "next/headers";
import { Suspense } from "react";

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

export const viewport: Viewport = {
  themeColor: "#0d1513",
  viewportFit: "cover",
  colorScheme: "dark",
};

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
          <NavProgress />
        </Suspense>
        {children}
      </body>
    </html>
  );
}
