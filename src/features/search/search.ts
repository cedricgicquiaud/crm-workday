/**
 * Recherche transverse (D8, D4), côté serveur : parcourt les objets du manifeste et interroge la
 * recherche que chacun a déclarée. Ce fichier ne nomme aucun objet.
 */
import "@/features/objects/manifest.server";
import { listObjects } from "@/features/objects/registry";
import { getServerObject } from "@/features/objects/registry.server";
import { normalizeQuery } from "./normalize";

/** Longueur de la saisie acceptée par l'API (espaces des bords retirés) ; le seuil de trois caractères est aussi celui de la palette (D8). */
export const SEARCH_MIN_LENGTH = 3;
export const SEARCH_MAX_LENGTH = 120;
/** Plafond de l'ensemble des résultats, tous objets confondus. */
export const SEARCH_MAX_RESULTS = 20;

export type SearchResult = {
  /** clé de l'objet (`getObject(type)` côté client donne l'icône et les libellés) */
  type: string;
  id: string;
  title: string;
  subtitle?: string;
  href: string;
};

/**
 * La saisie est interrogée normalisée (« acmé » trouve « ACME ») et, si elle en diffère, telle que
 * tapée (« acmé » trouve aussi « Acmé ») : les colonnes ne sont pas normalisées en base, une saisie
 * accentuée ne retrouverait sinon plus un nom accenté. Les doublons sont retirés par identifiant.
 */
function queryVariants(query: string): string[] {
  const typed = query.trim().replace(/\s+/g, " ");
  const normalized = normalizeQuery(query);
  return typed === normalized ? [normalized] : [normalized, typed];
}

export async function search(query: string): Promise<SearchResult[]> {
  const variants = queryVariants(query);
  const perObject = await Promise.all(
    listObjects().map(async (object) => {
      const { search: searchObject } = getServerObject(object.key);
      const hits = (await Promise.all(variants.map(searchObject))).flat();
      const seen = new Set<string>();
      return hits
        .filter((hit) => !seen.has(hit.id) && seen.add(hit.id))
        .map((hit) => ({ type: object.key, id: hit.id, title: hit.title, subtitle: hit.subtitle, href: object.href(hit.id) }));
    }),
  );
  return perObject.flat().slice(0, SEARCH_MAX_RESULTS);
}
