/**
 * Recherche transverse (D8, D4), côté serveur : parcourt les objets du manifeste et interroge la
 * recherche que chacun a déclarée. Ce fichier ne nomme aucun objet.
 */
import "@/features/objects/manifest.server";
import { listObjects } from "@/features/objects/registry";
import { getServerObject } from "@/features/objects/registry.server";
import { normalizeQuery } from "./normalize";

export type SearchResult = {
  /** clé de l'objet (`getObject(type)` côté client donne l'icône et les libellés) */
  type: string;
  id: string;
  title: string;
  subtitle?: string;
  href: string;
};

export async function search(query: string): Promise<SearchResult[]> {
  const text = normalizeQuery(query);
  const perObject = await Promise.all(
    listObjects().map(async (object) => {
      const hits = await getServerObject(object.key).search(text);
      return hits.map((hit) => ({ type: object.key, id: hit.id, title: hit.title, subtitle: hit.subtitle, href: object.href(hit.id) }));
    }),
  );
  return perObject.flat();
}
