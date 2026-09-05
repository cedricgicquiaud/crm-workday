/**
 * Entrées de navigation de la coque (D15) : la barre latérale les affiche, la palette les
 * reçoit par le registre (« Aller à … »). Une feature suivante ajoute les siennes dans son module.
 */
import { HomeIcon, SettingsIcon, UserRoundIcon, type LucideIcon } from "lucide-react";
import { registerPaletteEntries } from "@/features/shell/palette/registry";

export type NavEntry = { href: string; label: string; icon: LucideIcon };

export const SHELL_NAV: readonly NavEntry[] = [
  { href: "/accueil", label: "Accueil", icon: HomeIcon },
  { href: "/parametres", label: "Paramètres", icon: SettingsIcon },
  { href: "/profil", label: "Mon profil", icon: UserRoundIcon },
];

/** Vrai pour la page courante et ses sous-pages (`/parametres/journal` allume « Paramètres »). */
export function isCurrentPage(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

registerPaletteEntries(
  SHELL_NAV.map((entry) => ({
    id: `aller-${entry.href}`,
    label: `Aller à ${entry.label}`,
    group: "navigation",
    keywords: [entry.label],
    icon: entry.icon,
    run: ({ navigate }) => navigate(entry.href),
  })),
);
