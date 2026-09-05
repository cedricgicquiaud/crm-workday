/** Cookie posé par `SidebarProvider` (shadcn) : « false » quand la barre est repliée ; absent, elle est déployée (contrat 21). */
export const SIDEBAR_COOKIE = "sidebar_state";

export function isSidebarOpen(cookieValue: string | undefined): boolean {
  return cookieValue !== "false";
}
