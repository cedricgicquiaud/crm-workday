"use client";

import { SearchIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { openPalette } from "@/features/shell/palette/open-state";

export const SIDEBAR_TOGGLE_LABEL = "Replier ou déployer la barre latérale";

/** Barre supérieure de 40 px : la bascule de la barre latérale et, à droite, le raccourci ⌘K ; le fil d'Ariane et l'action de création viennent avec les objets. */
export function TopBar() {
  return (
    <header className="flex h-(--topbar-h) shrink-0 items-center gap-2 border-b px-2">
      <SidebarTrigger aria-label={SIDEBAR_TOGGLE_LABEL} title={SIDEBAR_TOGGLE_LABEL} />
      <Button variant="ghost" size="sm" className="ml-auto text-muted-foreground" onClick={openPalette}>
        <SearchIcon />
        Rechercher
        <kbd aria-hidden className="rounded-sm border bg-muted px-1 font-mono text-2xs text-muted-foreground">⌘K</kbd>
      </Button>
    </header>
  );
}
