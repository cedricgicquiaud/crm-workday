import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: "CRM Workday",
  description: "CRM du cabinet : clients, consultants, missions, factures.",
};

/**
 * Layout racine. La classe du thème (clair / sombre) sera posée ici, dans le HTML servi,
 * par la livraison 1.3 ; le socle laisse la préférence du navigateur.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <body className={`${inter.variable} min-h-screen bg-background font-sans text-foreground antialiased`}>{children}</body>
    </html>
  );
}
