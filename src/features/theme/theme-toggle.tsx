"use client";

import { MoonIcon, SunIcon, SunMoonIcon } from "lucide-react";
import { useSyncExternalStore } from "react";
import { SidebarMenuButton } from "@/components/ui/sidebar";
import { registerPaletteEntries } from "@/features/shell/palette/registry";
import { subscribeTheme, toggleTheme } from "@/features/theme/apply-theme";

const isDark = () => document.documentElement.classList.contains("dark");

const SAVE_ERROR = "Le thème n'a pas pu être enregistré.";

/* Dernier échec d'enregistrement, partagé par le bouton et l'entrée de la palette ; le bouton l'affiche sous lui. */
let saveError: string | null = null;
const errorListeners = new Set<() => void>();
const getSaveError = () => saveError;
function subscribeSaveError(listener: () => void): () => void {
  errorListeners.add(listener);
  return () => {
    errorListeners.delete(listener);
  };
}

/** Bascule le thème et retient l'échec éventuel : dans ce cas `toggleTheme` n'a pas changé l'écran. */
async function toggleAndReport() {
  saveError = (await toggleTheme()) ? null : SAVE_ERROR;
  for (const listener of errorListeners) listener();
}

/** Bouton du pied de la barre latérale : passe en sombre depuis le clair, et inversement ; « système » se choisit dans Mon profil. */
export function ThemeToggle() {
  const dark = useSyncExternalStore(subscribeTheme, isDark, () => false);
  const error = useSyncExternalStore(subscribeSaveError, getSaveError, () => null);
  const label = dark ? "Passer en thème clair" : "Passer en thème sombre";
  return (
    <>
      <SidebarMenuButton tooltip={label} className="h-(--sidebar-item-h)" onClick={() => void toggleAndReport()}>
        {dark ? <SunIcon /> : <MoonIcon />}
        <span>{label}</span>
      </SidebarMenuButton>
      {error && (
        <p role="alert" className="px-2 pt-0.5 text-xs text-danger group-data-[collapsible=icon]:hidden">
          {error}
        </p>
      )}
    </>
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
      await toggleAndReport();
    },
  },
]);
