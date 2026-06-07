import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import AppProviders from "@/components/AppProviders";

const fontSans = Inter({
  subsets: ["latin"],
  variable: "--font-geist-sans",
  display: "swap",
});

const fontMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Guitar AutoStomp",
  description: "Guitar tone switching app — switch tones at the right moment",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${fontSans.variable} ${fontMono.variable} h-full antialiased dark`}>
      <body className="min-h-full flex flex-col bg-[#0a0a0a] text-white font-sans">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
