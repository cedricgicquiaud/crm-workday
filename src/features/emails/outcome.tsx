import { Alert, AlertDescription } from "@/components/ui/alert";

export type Outcome = { kind: "status" | "alert"; text: string } | null;

/** Résultat d'une action : phrase annoncée (succès) ou encadré en défaut (échec). */
export function OutcomeMessage({ outcome }: { outcome: Outcome }) {
  if (!outcome) return null;
  if (outcome.kind === "status") {
    return (
      <p role="status" className="text-sm">
        {outcome.text}
      </p>
    );
  }
  return (
    <Alert variant="destructive">
      <AlertDescription>{outcome.text}</AlertDescription>
    </Alert>
  );
}

/** Message d'erreur sous le champ concerné (11 px, couleur danger), annoncé à l'affichage (fondations « Formulaires »). */
export function FieldError({ id, text }: { id: string; text?: string }) {
  if (!text) return null;
  return (
    <p id={id} role="alert" className="text-xs text-danger">
      {text}
    </p>
  );
}
