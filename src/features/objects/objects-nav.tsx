"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import "@/features/objects/manifest";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from "@/components/ui/sidebar";
import { listObjects } from "@/features/objects/registry";
import { isCurrentPage } from "@/features/shell/nav-entries";

/** Groupe « Objets » de la barre latérale (D4, D15) : une entrée par objet du registre, dans l'ordre de son rang. */
export function ObjectsNav() {
  const pathname = usePathname();
  const { setOpenMobile } = useSidebar();
  return (
    <nav aria-label="Objets">
      <SidebarMenu>
        {listObjects().map((object) => {
          const current = isCurrentPage(pathname, object.listHref);
          return (
            <SidebarMenuItem key={object.key}>
              <SidebarMenuButton
                isActive={current}
                tooltip={object.labels.plural}
                className="h-(--sidebar-item-h)"
                render={<Link href={object.listHref} aria-current={current ? "page" : undefined} onClick={() => setOpenMobile(false)} />}
              >
                <object.icon />
                <span>{object.labels.plural}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          );
        })}
      </SidebarMenu>
    </nav>
  );
}
