/**
 * Manifeste des objets, côté serveur : les déclarations client puis, une ligne par objet, la part
 * serveur (table, recherche). Le service générique et les routes d'API l'importent.
 * Objets déclarés : `company` (2.1a), `person` (2.2).
 */
import "@/features/objects/manifest";
import "@/features/companies/register.server";
import "@/features/persons/register.server";
