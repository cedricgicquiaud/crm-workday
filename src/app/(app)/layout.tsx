import { cookies } from "next/headers";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import type { Role } from "@/features/auth/accounts";
import { AppSidebar } from "@/features/shell/app-sidebar";
import { Palette } from "@/features/shell/palette/palette";
import { isSidebarOpen, SIDEBAR_COOKIE } from "@/features/shell/sidebar-state";
import { TopBar } from "@/features/shell/top-bar";
import { listPinnedViews } from "@/features/views/pinned";
import { requireSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/** Largeurs des fondations (224 px, 48 px repliée), lues dans les tokens de `globals.css`. */
const SIDEBAR_WIDTHS = { "--sidebar-width": "var(--sidebar-w)", "--sidebar-width-icon": "var(--sidebar-w-collapsed)" } as React.CSSProperties;

/** Pages avec session : barre latérale (état replié lu dans le cookie, contrat 21), barre supérieure, contenu. */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [{ user }, cookieStore] = await Promise.all([requireSession(), cookies()]);
  /* Les épingles se lisent en base : la barre latérale est un composant client, elle les reçoit en propriété (2.5b). */
  const pinnedViews = await listPinnedViews(user.id);
  return (
    <SidebarProvider defaultOpen={isSidebarOpen(cookieStore.get(SIDEBAR_COOKIE)?.value)} style={SIDEBAR_WIDTHS}>
      <AppSidebar user={{ firstName: user.firstName ?? "", lastName: user.lastName ?? "", role: user.role as Role }} pinnedViews={pinnedViews} />
      <SidebarInset>
        <TopBar />
        <div className="mx-auto w-full max-w-5xl p-4 sm:p-6">{children}</div>
      </SidebarInset>
      <Palette />
    </SidebarProvider>
  );
}
