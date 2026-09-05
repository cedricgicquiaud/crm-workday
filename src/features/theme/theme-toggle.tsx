"use client";

import { MoonIcon, SunIcon, SunMoonIcon } from "lucide-react";
import { useSyncExternalStore } from "react";
import { SidebarMenuButton } from "@/components/ui/sidebar";
import { registerPaletteEntries } from "@/features/shell/palette/registry";
import { subscribeTheme, toggleTheme } from "@/features/theme/apply-theme";

const isDark = () => document.documentElement.classList.contains("dark");

/** Bouton du pied de la barre latérale : passe en sombre depuis le clair, et inversement ; « système » se choisit dans Mon profil. */
export function ThemeToggle() {
  const dark = useSyncExternalStore(subscribeTheme, isDark, () => false);
  const label = dark ? "Passer en thème clair" : "Passer en thème sombre";
  return (
    <SidebarMenuButton tooltip={label} className="h-(--sidebar-item-h)" onClick={() => void toggleTheme()}>
      {dark ? <SunIcon /> : <MoonIcon />}
      <span>{label}</span>
    </SidebarMenuButton>
  );
}

/** L'entrée de la palette vit avec le bouton : le module du thème enregistre la sienne (D16). */
registerPaletteEntries([
  {
    id: "theme-basculer",
    label: "Basculer le thème clair / sombre",
    group: "actions",
    order: 10,
    keywords: ["sombre", "clair", "thème", "nuit", "jour"],
    icon: SunMoonIcon,
    run: async ({ close }) => {
      close();
      await toggleTheme();
    },
  },
]);
