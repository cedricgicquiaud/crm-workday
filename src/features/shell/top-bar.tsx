"use client";

import { PanelLeftIcon, SearchIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSidebar } from "@/components/ui/sidebar";
import { openPalette } from "@/features/shell/palette/open-state";
/* Enregistre la source de résultats de la palette (D8) dès que la coque se charge. */
import "@/features/search/register";

export const SIDEBAR_TOGGLE_LABEL = "Replier ou déployer la barre latérale";

/** Bascule de la barre latérale (tiroir sur téléphone). Nommée par `aria-label` : aucun texte masqué en `sr-only`, que les tests 375 px comptent comme un débordement. */
function SidebarToggle() {
  const { toggleSidebar } = useSidebar();
  return (
    <Button variant="ghost" size="icon-sm" aria-label={SIDEBAR_TOGGLE_LABEL} title={SIDEBAR_TOGGLE_LABEL} onClick={toggleSidebar}>
      <PanelLeftIcon />
    </Button>
  );
}

/** Barre supérieure de 40 px : la bascule de la barre latérale et, à droite, le raccourci ⌘K ; le fil d'Ariane et l'action de création viennent avec les objets. */
export function TopBar() {
  return (
    <header className="flex h-(--topbar-h) shrink-0 items-center gap-2 border-b px-2">
      <SidebarToggle />
      <Button variant="ghost" size="sm" className="ml-auto text-muted-foreground" onClick={openPalette}>
        <SearchIcon />
        Rechercher
        <kbd aria-hidden className="rounded-sm border bg-muted px-1 font-mono text-2xs text-muted-foreground">⌘K</kbd>
      </Button>
    </header>
  );
}
