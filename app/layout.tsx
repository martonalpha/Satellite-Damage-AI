import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import { Suspense } from "react";

import { AppNavbar } from "@/components/app-navbar";
import { AppThemeProvider } from "@/components/app-theme-provider";
import {
  APP_THEME_DEFAULT,
  getAppThemeInitScript,
  type AppTheme,
} from "@/lib/appTheme";

import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "SatDamage | Satellite Change Detection",
  description: "Post-event satellite image comparison and infrastructure damage assessment.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const initialTheme: AppTheme = APP_THEME_DEFAULT;

  return (
    <html
      lang="en"
      data-theme={initialTheme}
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      style={{ colorScheme: initialTheme }}
    >
      <body className="min-h-full flex flex-col">
        <AppThemeProvider initialTheme={initialTheme}>
          <Suspense fallback={null}>
            <AppNavbar />
          </Suspense>
          {children}
        </AppThemeProvider>
        <Script
          id="app-theme-init"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: getAppThemeInitScript() }}
          suppressHydrationWarning
        />
      </body>
    </html>
  );
}
