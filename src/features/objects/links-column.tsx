import { cn } from "cn";
import "@/features/objects/manifest";
import { getObject, listObjects } from "@/features/objects/registry";

/**
 * Colonne des liens de la fiche (D4, D5) : un groupe par relation déclarée, vers cet objet ou depuis lui.
 * En 2.1a aucun objet n'en déclare : la colonne montre son état vide. La livraison 2.2 (contact →
 * entreprise) y fait apparaître les fiches liées.
 */
export function LinksColumn({ type, className }: { type: string; className?: string }) {
  const own = getObject(type).relations.map((relation) => ({ key: `${type}-${relation.to}-${relation.fkColumn}`, label: relation.label }));
  const inverse = listObjects()
    .filter((object) => object.key !== type)
    .flatMap((object) => object.relations.filter((relation) => relation.to === type).map((relation) => ({ key: `${object.key}-${relation.fkColumn}`, label: relation.inverseLabel })));
  const groups = [...own, ...inverse];
  return (
    <section aria-label="Liens" className={cn("grid content-start gap-3", className)}>
      <h2 className="text-base font-medium">Liens</h2>
      {groups.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucun lien pour l&apos;instant. Les contacts arrivent avec la livraison suivante.</p>
      ) : (
        groups.map((group) => (
          <section key={group.key} aria-label={group.label} className="grid gap-1">
            <h3 className="text-sm font-medium text-muted-foreground">{group.label}</h3>
            <p className="text-sm text-muted-foreground">Aucune fiche liée.</p>
          </section>
        ))
      )}
    </section>
  );
}
