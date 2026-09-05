"use client";

import { LogOutIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { SidebarMenuButton } from "@/components/ui/sidebar";
import { registerPaletteEntries } from "@/features/shell/palette/registry";
import { applyTheme } from "@/features/theme/apply-theme";
import { authClient } from "@/lib/auth/client";

const LABEL = "Se déconnecter";

/** Ferme la session, rend le thème au navigateur (D17) et va à la connexion. */
export async function signOut(navigate: (href: string) => void) {
  await authClient.signOut();
  applyTheme("systeme");
  navigate("/connexion");
}

/** Bouton du pied de la barre latérale. */
export function SignOutButton() {
  const router = useRouter();
  return (
    <SidebarMenuButton tooltip={LABEL} className="h-(--sidebar-item-h)" onClick={() => void signOut((href) => router.push(href))}>
      <LogOutIcon />
      <span>{LABEL}</span>
    </SidebarMenuButton>
  );
}

/** L'entrée de la palette vit avec le bouton (D16). */
registerPaletteEntries([
  {
    id: "session-deconnexion",
    label: LABEL,
    group: "actions",
    keywords: ["déconnexion", "quitter", "sortir"],
    icon: LogOutIcon,
    run: ({ close, navigate }) => {
      close();
      return signOut(navigate);
    },
  },
]);
