import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { htmlThemeClass } from "@/features/theme/html-theme";
import { isTheme, type Theme } from "@/features/theme/theme";
import { getSession } from "@/lib/auth/session";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: "CRM Workday",
  description: "CRM du cabinet : clients, consultants, missions, factures.",
};

/** Le layout lit la session : aucune page n'est figée au build. */
export const dynamic = "force-dynamic";

/** Thème de la personne connectée, lu en base à chaque requête (la valeur en base fait foi, D17) ; « système » sans session. */
async function currentTheme(): Promise<Theme> {
  const session = await getSession();
  const theme = session?.user.theme;
  return isTheme(theme) ? theme : "systeme";
}

/** Layout racine. La classe du thème est dans le HTML servi, avant tout script (contrat 26). */
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const theme = await currentTheme();
  return (
    <html lang="fr" className={htmlThemeClass(theme)} data-theme={theme} suppressHydrationWarning>
      <body className={`${inter.variable} min-h-screen bg-background font-sans text-foreground antialiased`}>{children}</body>
    </html>
  );
}
