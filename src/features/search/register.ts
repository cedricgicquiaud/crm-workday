/**
 * Source de résultats générique de la palette Cmd+K (D8), côté client : elle interroge
 * `GET /api/recherche` et habille chaque résultat de l'icône de son objet. Importée par la coque
 * pour être enregistrée dès son chargement ; ce fichier ne nomme aucun objet.
 */
import "@/features/objects/manifest";
import { getObject } from "@/features/objects/registry";
import { registerPaletteSource, type PaletteResult } from "@/features/shell/palette/registry";
import type { SearchResult } from "./search";

async function searchObjects(query: string): Promise<PaletteResult[]> {
  const response = await fetch(`/api/recherche?q=${encodeURIComponent(query)}`);
  if (!response.ok) throw new Error(`Recherche refusée : ${response.status}`);
  const { results } = (await response.json()) as { results: SearchResult[] };
  return results.map((result) => ({
    id: `${result.type}:${result.id}`,
    label: result.title,
    subtitle: result.subtitle,
    icon: getObject(result.type).icon,
    href: result.href,
  }));
}

registerPaletteSource({ id: "objets", order: 10, search: searchObjects });
