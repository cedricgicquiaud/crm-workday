import { cn } from "cn";
import { and, desc, eq, getTableColumns, isNull } from "drizzle-orm";
import Link from "next/link";
import "@/features/objects/manifest.server";
import { getObject, listObjects, type Relation } from "@/features/objects/registry";
import { getServerObject } from "@/features/objects/registry.server";
import { db } from "@/lib/db";

export type LinkedRecord = { id: string; title: string; href: string };
/** Création rapide depuis ce groupe (D7) : l'objet à créer et le champ pré-rempli avec la fiche courante. */
export type LinkedCreate = { type: string; prefill: Record<string, string> };
export type LinkedGroup = { key: string; label: string; records: LinkedRecord[]; create?: LinkedCreate };

/** Fiches d'un objet dont la colonne `fkColumn` vaut `id`, non archivées, la dernière modifiée en tête. */
async function recordsPointingTo(objectKey: string, fkColumn: string, id: string): Promise<LinkedRecord[]> {
  const definition = getObject(objectKey);
  const { table } = getServerObject(objectKey);
  const columns = getTableColumns(table);
  const rows = await db
    .select({ id: columns.id, title: columns[definition.titleField] })
    .from(table)
    .where(and(eq(columns[fkColumn], id), isNull(columns.archivedAt)))
    .orderBy(desc(columns.updatedAt), desc(columns.id));
  return rows.map((row) => ({ id: String(row.id), title: String(row.title ?? ""), href: definition.href(String(row.id)) }));
}

/** La fiche désignée par la clé étrangère d'une relation (une au plus), ou rien si la colonne est vide. */
async function recordPointedBy(type: string, id: string, relation: Relation): Promise<LinkedRecord[]> {
  const { table } = getServerObject(type);
  const own = getTableColumns(table);
  const [source] = await db.select({ fk: own[relation.fkColumn] }).from(table).where(eq(own.id, id)).limit(1);
  if (!source?.fk) return [];
  const target = getObject(relation.to);
  const targetTable = getServerObject(relation.to).table;
  const columns = getTableColumns(targetTable);
  const [row] = await db.select({ id: columns.id, title: columns[target.titleField] }).from(targetTable).where(eq(columns.id, String(source.fk))).limit(1);
  return row ? [{ id: String(row.id), title: String(row.title ?? ""), href: target.href(String(row.id)) }] : [];
}

/**
 * Groupes de la colonne des liens d'une fiche (D4) : un par relation déclarée par l'objet (vers la
 * fiche qu'il désigne) puis un par relation déclarée vers lui par un autre objet (les fiches qui le
 * désignent). Tout vient du registre : aucun objet n'est nommé ici.
 */
export async function linkedGroups(type: string, id: string): Promise<LinkedGroup[]> {
  const own = await Promise.all(
    getObject(type).relations.map(async (relation) => ({ key: `${type}-${relation.to}-${relation.fkColumn}`, label: relation.label, records: await recordPointedBy(type, id, relation) })),
  );
  const inverse = await Promise.all(
    listObjects()
      .filter((object) => object.key !== type)
      .flatMap((object) => object.relations.filter((relation) => relation.to === type).map((relation) => ({ object, relation })))
      .map(async ({ object, relation }) => ({
        key: `${object.key}-${relation.fkColumn}`,
        label: relation.inverseLabel,
        ...(relation.prefill ? { create: { type: object.key, prefill: { [relation.prefill]: id } } } : {}),
        records: await recordsPointingTo(object.key, relation.fkColumn, id),
      })),
  );
  return [...own, ...inverse];
}

/**
 * Colonne des liens de la fiche (D4, D5) : un groupe par relation déclarée, vers cet objet ou depuis
 * lui, avec les fiches liées chargées par le registre. Sans relation déclarée, la colonne montre son
 * état vide.
 */
export async function LinksColumn({ type, id, className }: { type: string; id: string; className?: string }) {
  const groups = await linkedGroups(type, id);
  return (
    <section aria-label="Liens" className={cn("grid min-w-0 content-start gap-3", className)}>
      <h2 className="text-base font-medium">Liens</h2>
      {groups.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucune fiche liée pour l&apos;instant.</p>
      ) : (
        groups.map((group) => (
          <section key={group.key} aria-label={group.label} className="grid gap-1">
            <h3 className="text-sm font-medium text-muted-foreground">{group.label}</h3>
            {group.records.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucune fiche liée.</p>
            ) : (
              <ul className="grid gap-0.5">
                {group.records.map((record) => (
                  <li key={record.id} className="min-w-0 truncate text-sm" title={record.title}>
                    <Link href={record.href} className="hover:underline focus-visible:rounded-sm">
                      {record.title}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))
      )}
    </section>
  );
}
