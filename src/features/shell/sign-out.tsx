"use client";

import { LogOutIcon } from "lucide-react";
import { SidebarMenuButton } from "@/components/ui/sidebar";
import { authClient } from "@/lib/auth/client";
import { registerPaletteEntries } from "@/features/shell/palette/registry";

const LABEL = "Se déconnecter";

/** Ferme la session puis recharge sur la connexion : le HTML repart sans thème d'utilisateur (D17). */
export async function signOut() {
  await authClient.signOut();
  window.location.assign("/connexion");
}

/** Bouton du pied de la barre latérale. */
export function SignOutButton() {
  return (
    <SidebarMenuButton tooltip={LABEL} className="h-(--sidebar-item-h)" onClick={() => void signOut()}>
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
    run: ({ close }) => {
      close();
      return signOut();
    },
  },
]);
