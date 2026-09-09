import { cn } from "cn";
import { and, count, desc, eq, getTableColumns, isNull } from "drizzle-orm";
import Link from "next/link";
import "@/features/objects/manifest.server";
import { QuickCreateDialog } from "@/features/objects/quick-create-dialog";
import { getObject, listObjects, type Relation } from "@/features/objects/registry";
import { getServerObject } from "@/features/objects/registry.server";
import { listUserOptions } from "@/features/objects/service";
import { requireSession } from "@/lib/auth/session";
import { db } from "@/lib/db";

export type LinkedRecord = { id: string; title: string; href: string };
/** Création rapide depuis ce groupe (D7) : l'objet à créer et le champ pré-rempli avec la fiche courante. */
export type LinkedCreate = { type: string; prefill: Record<string, string> };
/** `more` : fiches liées au-delà de la borne, comptées mais pas chargées. */
export type LinkedGroup = { key: string; label: string; records: LinkedRecord[]; more?: number; create?: LinkedCreate };

/** Fiches liées chargées au plus dans un groupe : une entreprise à trois cents contacts n'en affiche pas trois cents. */
export const LINKED_RECORDS_LIMIT = 20;

/** Fiches d'un objet dont la colonne `fkColumn` vaut `id`, non archivées, la dernière modifiée en tête, bornées ; `more` compte celles qui restent. */
async function recordsPointingTo(objectKey: string, fkColumn: string, id: string): Promise<{ records: LinkedRecord[]; more: number }> {
  const definition = getObject(objectKey);
  const { table } = getServerObject(objectKey);
  const columns = getTableColumns(table);
  const linked = and(eq(columns[fkColumn], id), isNull(columns.archivedAt));
  const rows = await db
    .select({ id: columns.id, title: columns[definition.titleField] })
    .from(table)
    .where(linked)
    .orderBy(desc(columns.updatedAt), desc(columns.id))
    .limit(LINKED_RECORDS_LIMIT);
  const records = rows.map((row) => ({ id: String(row.id), title: String(row.title ?? ""), href: definition.href(String(row.id)) }));
  /* Le compte n'est demandé que si la borne est atteinte : en dessous, les fiches chargées sont toutes celles qui existent. */
  if (records.length < LINKED_RECORDS_LIMIT) return { records, more: 0 };
  const [total] = await db.select({ value: count() }).from(table).where(linked);
  return { records, more: Math.max(Number(total?.value ?? records.length) - records.length, 0) };
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
 * désignent). Tout vient du registre : aucun objet n'est nommé ici. Un groupe inverse est borné :
 * au-delà de `LINKED_RECORDS_LIMIT`, il porte le nombre de fiches restantes (`more`).
 */
export async function linkedGroups(type: string, id: string): Promise<LinkedGroup[]> {
  const own = await Promise.all(
    getObject(type).relations.map(async (relation) => ({ key: `${type}-${relation.to}-${relation.fkColumn}`, label: relation.label, records: await recordPointedBy(type, id, relation) })),
  );
  const inverse = await Promise.all(
    listObjects()
      .filter((object) => object.key !== type)
      .flatMap((object) => object.relations.filter((relation) => relation.to === type).map((relation) => ({ object, relation })))
      .map(async ({ object, relation }) => {
        const { records, more } = await recordsPointingTo(object.key, relation.fkColumn, id);
        return {
          key: `${object.key}-${relation.fkColumn}`,
          label: relation.inverseLabel,
          ...(relation.prefill ? { create: { type: object.key, prefill: { [relation.prefill]: id } } } : {}),
          records,
          ...(more > 0 ? { more } : {}),
        };
      }),
  );
  return [...own, ...inverse];
}

/** « Ajouter une personne », « Ajouter un consultant » : le genre vient de l'article déclaré. */
const addLabel = (objectKey: string) => {
  const { labels } = getObject(objectKey);
  return `Ajouter ${labels.article} ${labels.singular.toLowerCase()}`;
};

/**
 * Colonne des liens de la fiche (D4, D5) : un groupe par relation déclarée, vers cet objet ou depuis
 * lui, avec les fiches liées chargées par le registre. Un groupe inverse dont la relation déclare un
 * `prefill` offre la création rapide de la fiche liée, pré-remplie avec celle-ci (« ajouter un
 * contact », D7) : bouton secondaire, le bouton plein reste celui de la liste. Sans relation
 * déclarée, la colonne montre son état vide.
 */
export async function LinksColumn({ type, id, className, readOnly = false }: { type: string; id: string; className?: string; readOnly?: boolean }) {
  const [groups, users, { user }] = await Promise.all([linkedGroups(type, id), listUserOptions(), requireSession()]);
  return (
    <section aria-label="Liens" className={cn("grid min-w-0 content-start gap-3", className)}>
      <h2 className="text-base font-medium">Liens</h2>
      {groups.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucune fiche liée pour l&apos;instant.</p>
      ) : (
        groups.map((group) => (
          <section key={group.key} aria-label={group.label} className="grid justify-items-start gap-1">
            <h3 className="text-sm font-medium text-muted-foreground">{group.label}</h3>
            {/* Fiche archivée : la création rapide disparaît — elle ne peut plus rattacher quoi que ce soit (D21). */}
            {group.create && !readOnly && <QuickCreateDialog type={group.create.type} users={users} currentUserId={user.id} prefill={group.create.prefill} trigger={{ label: addLabel(group.create.type), variant: "outline", size: "sm" }} />}
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
            {group.more ? <p className="text-xs text-muted-foreground">{`et ${group.more} autre${group.more > 1 ? "s" : ""}`}</p> : null}
          </section>
        ))
      )}
    </section>
  );
}
