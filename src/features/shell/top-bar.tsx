"use client";

import { SidebarTrigger } from "@/components/ui/sidebar";

export const SIDEBAR_TOGGLE_LABEL = "Replier ou déployer la barre latérale";

/** Barre supérieure de 40 px : la bascule de la barre latérale ; le fil d'Ariane et l'action de création viennent avec les objets. */
export function TopBar() {
  return (
    <header className="flex h-(--topbar-h) shrink-0 items-center gap-2 border-b px-2">
      <SidebarTrigger aria-label={SIDEBAR_TOGGLE_LABEL} title={SIDEBAR_TOGGLE_LABEL} />
    </header>
  );
}
