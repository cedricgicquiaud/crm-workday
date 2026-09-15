/**
 * Entrées de création de la palette ⌘K (D12, frontière F7) : une par liste qui offre une création
 * rapide, **générée depuis le registre**. Aucune n'est écrite à la main dans la coque — déclarer une
 * liste demain lui donne la sienne, dans l'ordre des listes, sans qu'on touche à la palette.
 *
 * Une entrée ouvre la liste avec sa création demandée (`?creation=1`) : la palette sait naviguer,
 * c'est la liste qui porte son dialogue et ses règles.
 */
import "@/features/objects/manifest";
import { createLabel } from "@/features/objects/labels";
import { getObject, listLists } from "@/features/objects/registry";
import { registerPaletteEntries } from "@/features/shell/palette/registry";

/** Paramètre d'URL qui demande à une liste d'ouvrir sa création dès l'arrivée. */
export const CREATE_PARAM = "creation";

/** L'adresse d'une liste, création ouverte. */
export const createUrl = (href: string): string => `${href}?${CREATE_PARAM}=1`;

registerPaletteEntries(
  listLists()
    .filter((list) => list.create !== false)
    .map((list, index) => {
      const definition = getObject(list.objectKey);
      const label = (list.create === false ? undefined : list.create?.label) ?? createLabel(definition.labels);
      return {
        id: `creation-${list.key}`,
        label,
        group: "actions" as const,
        /* Le rang suit celui des listes : l'ordre ne dépend jamais de l'ordre des imports. */
        order: (index + 1) * 10,
        keywords: [list.label, definition.labels.singular],
        icon: list.icon,
        run: ({ navigate }) => navigate(createUrl(list.href)),
      };
    }),
);
