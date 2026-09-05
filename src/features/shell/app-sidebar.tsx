"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { ROLE_LABELS } from "@/features/accounts/labels";
import type { Role } from "@/features/auth/accounts";
import { isCurrentPage, SHELL_NAV } from "@/features/shell/nav-entries";
import { SignOutButton } from "@/features/shell/sign-out";
import { ThemeToggle } from "@/features/theme/theme-toggle";

export type ShellUser = { firstName: string; lastName: string; role: Role };

const initials = (user: ShellUser) => `${user.firstName[0] ?? ""}${user.lastName[0] ?? ""}`.toUpperCase();

/** Barre latérale (D15) : navigation, section « Objets » encore vide, pied avec le compte. 224 px, 48 px repliée. */
export function AppSidebar({ user }: { user: ShellUser }) {
  const pathname = usePathname();
  const { setOpenMobile } = useSidebar();
  const fullName = `${user.firstName} ${user.lastName}`.trim();
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="h-(--topbar-h) flex-row items-center gap-2 border-b px-2.5">
        <span aria-hidden className="flex size-5 shrink-0 items-center justify-center rounded-sm bg-primary text-2xs font-semibold text-primary-foreground">
          CW
        </span>
        <span className="truncate text-base font-semibold group-data-[collapsible=icon]:hidden">CRM Workday</span>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <nav aria-label="Navigation principale">
              <SidebarMenu>
                {SHELL_NAV.map((entry) => {
                  const current = isCurrentPage(pathname, entry.href);
                  return (
                    <SidebarMenuItem key={entry.href}>
                      <SidebarMenuButton
                        isActive={current}
                        tooltip={entry.label}
                        className="h-(--sidebar-item-h)"
                        /* Sur téléphone, choisir une page referme le tiroir. */
                        render={<Link href={entry.href} aria-current={current ? "page" : undefined} onClick={() => setOpenMobile(false)} />}
                      >
                        <entry.icon />
                        <span>{entry.label}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </nav>
          </SidebarGroupContent>
        </SidebarGroup>
        {/* Repliée, la section vide disparaît : son libellé effacé continuerait sinon d'intercepter les clics sur « Mon profil ». */}
        <SidebarGroup className="group-data-[collapsible=icon]:hidden">
          <SidebarGroupLabel className="h-6 text-2xs font-semibold uppercase tracking-(--tracking-caps)">Objets</SidebarGroupLabel>
          <SidebarGroupContent>
            <p className="px-2 py-1 text-xs text-muted-foreground">Clients, consultants, missions et factures arrivent avec les features suivantes.</p>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="border-t">
        <SidebarMenu>
          <SidebarMenuItem>
            <ThemeToggle />
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SignOutButton />
          </SidebarMenuItem>
        </SidebarMenu>
        <div className="flex items-center gap-2 px-1 py-1 group-data-[collapsible=icon]:px-0" title={fullName}>
          <Avatar size="sm">
            <AvatarFallback className="bg-primary-subtle text-2xs font-semibold text-primary-subtle-foreground">{initials(user)}</AvatarFallback>
          </Avatar>
          <div className="grid min-w-0 leading-tight group-data-[collapsible=icon]:hidden">
            <span className="truncate text-sm font-medium">{fullName}</span>
            <span className="truncate text-xs text-muted-foreground">{ROLE_LABELS[user.role]}</span>
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
