"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import "@/features/objects/manifest";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from "@/components/ui/sidebar";
import { listLists } from "@/features/objects/registry";
import { isCurrentPage } from "@/features/shell/nav-entries";

/**
 * Groupe « Objets » de la barre latérale (D4, D15, D10) : une entrée par **liste** du registre — celle
 * de chaque objet, puis celles qu'un objet déclare (« Consultants ») — dans l'ordre de leur rang.
 */
export function ObjectsNav() {
  const pathname = usePathname();
  const { setOpenMobile } = useSidebar();
  return (
    <nav aria-label="Objets">
      <SidebarMenu>
        {listLists().map((list) => {
          const current = isCurrentPage(pathname, list.href);
          return (
            <SidebarMenuItem key={list.key}>
              <SidebarMenuButton
                isActive={current}
                tooltip={list.label}
                className="h-(--sidebar-item-h)"
                render={<Link href={list.href} aria-current={current ? "page" : undefined} onClick={() => setOpenMobile(false)} />}
              >
                <list.icon />
                <span>{list.label}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          );
        })}
      </SidebarMenu>
    </nav>
  );
}
