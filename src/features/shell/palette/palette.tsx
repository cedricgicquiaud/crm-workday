"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useSyncExternalStore } from "react";
import { Command, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandShortcut } from "@/components/ui/command";
import { closePalette, isPaletteOpen, setPaletteOpen, subscribePaletteOpen, togglePalette } from "@/features/shell/palette/open-state";
import { getPaletteEntries, subscribePalette, type PaletteContext, type PaletteGroup } from "@/features/shell/palette/registry";

export const PALETTE_TITLE = "Palette de commandes";
export const PALETTE_PLACEHOLDER = "Rechercher une page ou une action…";

/** Ordre des sections (fondations : résultats puis actions). */
const GROUPS: readonly { id: PaletteGroup; heading: string }[] = [
  { id: "navigation", heading: "Navigation" },
  { id: "actions", heading: "Actions" },
];

const isPaletteShortcut = (event: KeyboardEvent) => (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k";

/** Palette Cmd+K (D16) : elle lit le registre, et rien d'autre. Première ligne présélectionnée, pied avec les touches. */
export function Palette() {
  const router = useRouter();
  const open = useSyncExternalStore(subscribePaletteOpen, isPaletteOpen, () => false);
  const entries = useSyncExternalStore(subscribePalette, getPaletteEntries, getPaletteEntries);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!isPaletteShortcut(event)) return;
      event.preventDefault();
      togglePalette();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const context = useMemo<PaletteContext>(
    () => ({
      navigate: (href) => {
        closePalette();
        router.push(href);
      },
      close: closePalette,
    }),
    [router],
  );

  return (
    <CommandDialog open={open} onOpenChange={setPaletteOpen} title={PALETTE_TITLE} description="Aller à une page ou lancer une action." className="sm:max-w-(--command-w)">
      <Command>
        <CommandInput placeholder={PALETTE_PLACEHOLDER} />
        <CommandList>
        <CommandEmpty>Aucun résultat.</CommandEmpty>
        {GROUPS.map((group) => {
          const items = entries.filter((entry) => entry.group === group.id);
          if (items.length === 0) return null;
          return (
            <CommandGroup key={group.id} heading={group.heading}>
              {items.map((entry) => (
                <CommandItem key={entry.id} value={entry.label} keywords={entry.keywords} onSelect={() => void entry.run(context)}>
                  {entry.icon && <entry.icon />}
                  <span>{entry.label}</span>
                  {entry.shortcut && <CommandShortcut>{entry.shortcut}</CommandShortcut>}
                </CommandItem>
              ))}
            </CommandGroup>
          );
        })}
        </CommandList>
        <p className="flex gap-3 border-t bg-subtle px-3 py-1.5 text-xs text-muted-foreground">
          <span>↑↓ naviguer</span>
          <span>↵ ouvrir</span>
          <span>Échap fermer</span>
        </p>
      </Command>
    </CommandDialog>
  );
}
