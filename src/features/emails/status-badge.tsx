import { cn } from "cn";
import { Badge } from "@/components/ui/badge";
import type { EmailStatus } from "@/lib/mail/send";
import { STATUS_LABELS } from "./labels";

/**
 * Une teinte par famille de statut (fondations « Signalement ») : capturé = inerte (neutre, point creux),
 * envoyé = abouti (succès), échec = en défaut (danger). Le libellé porte l'information, jamais la couleur seule.
 */
const FAMILY: Record<EmailStatus, { badge: string; dot: string }> = {
  capture: { badge: "border-border bg-muted text-muted-foreground", dot: "border border-current" },
  envoye: { badge: "border-success-border bg-success-subtle text-success", dot: "bg-current" },
  echec: { badge: "border-danger-border bg-danger-subtle text-danger", dot: "bg-current" },
};

export function EmailStatusBadge({ status }: { status: EmailStatus }) {
  const family = FAMILY[status];
  return (
    <Badge variant="outline" className={cn("gap-1.5", family.badge)}>
      <span aria-hidden className={cn("size-1.5 rounded-full", family.dot)} />
      {STATUS_LABELS[status]}
    </Badge>
  );
}
