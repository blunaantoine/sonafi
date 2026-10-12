import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "Sommet Sonafi — Gestion des pauses",
  description: "Gestion des pauses et entrées du Sommet national de la jeune fille (Sonafi).",
  keywords: ["Sonafi", "Sommet national", "gestion pauses", "badges QR"],
  authors: [{ name: "Sonafi" }],
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon-192.png", type: "image/png", sizes: "192x192" },
      { url: "/icon-512.png", type: "image/png", sizes: "512x512" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  themeColor: "#0F4180",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <body
        className={`${jakarta.variable} antialiased bg-background text-foreground`}
        style={{ fontFamily: "var(--font-jakarta), system-ui, sans-serif" }}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
