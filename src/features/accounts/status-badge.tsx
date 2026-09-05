import { cn } from "cn";
import { Badge } from "@/components/ui/badge";
import type { AccountStatus } from "./accounts";
import { STATUS_LABELS } from "./labels";

/**
 * Une teinte par famille de statut (fondations « Signalement ») : invité = à traiter (avertissement),
 * actif = abouti (succès), désactivé = inerte (neutre, point creux). Le libellé porte l'information,
 * jamais la couleur seule.
 */
const FAMILY: Record<AccountStatus, { badge: string; dot: string }> = {
  invite: { badge: "border-warning-border bg-warning-subtle text-warning", dot: "bg-current" },
  actif: { badge: "border-success-border bg-success-subtle text-success", dot: "bg-current" },
  desactive: { badge: "border-border bg-muted text-muted-foreground", dot: "border border-current" },
};

export function StatusBadge({ status }: { status: AccountStatus }) {
  const family = FAMILY[status];
  return (
    <Badge variant="outline" className={cn("gap-1.5", family.badge)}>
      <span aria-hidden className={cn("size-1.5 rounded-full", family.dot)} />
      {STATUS_LABELS[status]}
    </Badge>
  );
}
