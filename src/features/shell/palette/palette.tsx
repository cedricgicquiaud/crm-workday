"use client";

import { defaultFilter } from "cmdk";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandShortcut } from "@/components/ui/command";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { closePalette, isPaletteOpen, setPaletteOpen, subscribePaletteOpen, togglePalette } from "@/features/shell/palette/open-state";
import {
  getPaletteEntries,
  isSearchableQuery,
  searchPaletteSources,
  subscribePalette,
  type PaletteContext,
  type PaletteGroup,
  type PaletteResult,
} from "@/features/shell/palette/registry";

const PALETTE_TITLE = "Palette de commandes";
const PALETTE_PLACEHOLDER = "Rechercher une page ou une action…";
const RESULTS_HEADING = "Résultats";
/** Délai après la dernière frappe avant d'interroger les sources. */
const SEARCH_DEBOUNCE_MS = 200;
/** Les valeurs des résultats commencent par ce préfixe : c'est ainsi que le filtre les reconnaît. */
const RESULT_VALUE_PREFIX = "resultat:";

/** Ordre des sections (fondations : résultats puis actions). */
const GROUPS: readonly { id: PaletteGroup; heading: string }[] = [
  { id: "navigation", heading: "Navigation" },
  { id: "actions", heading: "Actions" },
];

const isPaletteShortcut = (event: KeyboardEvent) => (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k";

const resultValue = (result: PaletteResult) => `${RESULT_VALUE_PREFIX}${result.id}`;

/** Les résultats arrivent déjà filtrés par le serveur : cmdk ne les refiltre pas et les classe en tête ; les entrées gardent son classement flou. */
const paletteFilter = (value: string, search: string, keywords?: string[]) => (value.startsWith(RESULT_VALUE_PREFIX) ? 1 : defaultFilter(value, search, keywords));

/** Les résultats et la saisie qui les a produits : tant qu'elles diffèrent, une recherche est en cours. */
type Found = { query: string; results: PaletteResult[] };

/** Contenu de la palette : monté à l'ouverture, démonté à la fermeture, sa saisie repart donc vide. */
function PaletteCommand({ context }: { context: PaletteContext }) {
  const entries = useSyncExternalStore(subscribePalette, getPaletteEntries, getPaletteEntries);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState("");
  const [found, setFound] = useState<Found>({ query: "", results: [] });
  const results = isSearchableQuery(query) ? found.results : [];
  const searching = isSearchableQuery(query) && found.query !== query;

  /* Interroge les sources après un temps d'arrêt, à partir de trois caractères ; le premier résultat prend la première ligne, même si une entrée était déjà sélectionnée. */
  useEffect(() => {
    if (!isSearchableQuery(query)) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const hits = await searchPaletteSources(query);
      if (cancelled) return;
      setFound({ query, results: hits });
      if (hits[0]) setSelected(resultValue(hits[0]));
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  return (
    <Command filter={paletteFilter} value={selected} onValueChange={setSelected}>
      <CommandInput placeholder={PALETTE_PLACEHOLDER} value={query} onValueChange={setQuery} />
      <CommandList>
        {!searching && <CommandEmpty>Aucun résultat.</CommandEmpty>}
        {results.length > 0 && (
          <CommandGroup heading={RESULTS_HEADING}>
            {results.map((result) => (
              <CommandItem key={result.id} value={resultValue(result)} onSelect={() => context.navigate(result.href)}>
                {result.icon && <result.icon />}
                <span className="truncate">{result.label}</span>
                {result.subtitle && <span className="truncate text-xs text-muted-foreground">{result.subtitle}</span>}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
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
  );
}

/** Palette Cmd+K (D16, D8) : elle lit le registre (entrées et sources), et rien d'autre. Première ligne présélectionnée, pied avec les touches. */
export function Palette() {
  const router = useRouter();
  const open = useSyncExternalStore(subscribePaletteOpen, isPaletteOpen, () => false);

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
    /* `Dialog` plutôt que `CommandDialog` : ce dernier laisse son titre masqué dans la page même fermée, ce que les tests 375 px comptent comme un débordement. */
    <Dialog open={open} onOpenChange={setPaletteOpen}>
      <DialogContent className="top-1/3 translate-y-0 overflow-hidden rounded-xl! p-0 sm:max-w-(--command-w)" showCloseButton={false}>
        <DialogTitle className="sr-only">{PALETTE_TITLE}</DialogTitle>
        <DialogDescription className="sr-only">Aller à une page, ouvrir une fiche ou lancer une action.</DialogDescription>
        <PaletteCommand context={context} />
      </DialogContent>
    </Dialog>
  );
}
