"use client";

import Link from "next/link";
import "@/features/objects/manifest";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from "@/components/ui/sidebar";
import { findList } from "@/features/objects/registry";
import type { PinnedViewEntry } from "@/features/views/pinned";

/**
 * Groupe « Vues épinglées » de la barre latérale (D15, contrat 24) : les vues que cet utilisateur a
 * mises là, dans l'ordre qu'il a choisi. Chacune ouvre sa liste dans son état (`?vue=`), à l'adresse
 * que cette liste déclare. Une vue dont la liste n'est plus déclarée au registre est simplement
 * ignorée : aucune barre latérale ne montre un lien mort.
 */
export function PinnedViewsNav({ views }: { views: readonly PinnedViewEntry[] }) {
  const { setOpenMobile } = useSidebar();
  return (
    <nav aria-label="Vues épinglées">
      <SidebarMenu>
        {views.map((view) => {
          const list = findList(view.objectType);
          if (!list) return null;
          return (
            <SidebarMenuItem key={view.id}>
              <SidebarMenuButton
                tooltip={view.name}
                className="h-(--sidebar-item-h)"
                /* Sur téléphone, choisir une vue referme le tiroir. */
                render={<Link href={`${list.href}?vue=${encodeURIComponent(view.id)}`} onClick={() => setOpenMobile(false)} />}
              >
                <list.icon />
                <span>{view.name}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          );
        })}
      </SidebarMenu>
    </nav>
  );
}
