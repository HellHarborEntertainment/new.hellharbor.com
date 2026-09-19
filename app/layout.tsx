import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Hell Harbor Entertainment",
  description: "Enter the Castle of Hell Harbor in Montesano, Washington: the official home of Hell Harbor Entertainment, forging music, film, games, publishing and live productions since 2018.",
  other: { "codex-preview": "development" },
  icons: { icon: "/media/hhe-logo-new.png", shortcut: "/media/hhe-logo-new.png" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
