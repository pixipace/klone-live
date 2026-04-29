import type { Metadata } from "next";
import { Inter, Instrument_Serif } from "next/font/google";
import { Geist_Mono } from "next/font/google";
import "./globals.css";

// Inter — geometric sans, our primary text face. Stylistic alternates
// (cv02/03/04/11) enabled in globals.css for cleaner numerals.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

// Instrument Serif — used SPARINGLY for one signature element per page
// (oversized hero numbers, key callouts). Italic-friendly. The mix of
// modern sans + classical serif is what gives Klone a unique look that
// neither EL nor Linear nor Vercel does.
const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  subsets: ["latin"],
  weight: ["400"],
  style: ["normal", "italic"],
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
      className={`${inter.variable} ${instrumentSerif.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        {children}
      </body>
    </html>
  );
}
