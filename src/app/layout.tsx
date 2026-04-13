import type { Metadata } from "next";
import { Outfit } from "next/font/google";
import { Geist_Mono } from "next/font/google";
import "./globals.css";

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Klone — Social Media, Simplified",
  description:
    "Publish to TikTok, Instagram, Facebook, YouTube, and LinkedIn from one dashboard.",
  icons: {
    icon: "/favicon.png",
  },
  openGraph: {
    title: "Klone — Social Media, Simplified",
    description:
      "Publish to TikTok, Instagram, Facebook, YouTube, and LinkedIn from one dashboard.",
    url: "https://klone.live",
    siteName: "Klone",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${outfit.variable} ${geistMono.variable} h-full antialiased dark`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        {children}
      </body>
    </html>
  );
}
