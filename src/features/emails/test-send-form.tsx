"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { SendTemplatedEmailResult } from "@/lib/mail/send";
import { callApi } from "./api-client";
import { FieldError, OutcomeMessage, type Outcome } from "./outcome";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Result = SendTemplatedEmailResult & { to: string };

/** Ce que l'administrateur lit selon le sort de l'email de test. */
function describe(result: Result): Outcome {
  switch (result.status) {
    case "capture":
      return { kind: "status", text: `Email de test capturé pour ${result.to} : en développement, rien ne part. Il est lisible dans le journal.` };
    case "envoye":
      return { kind: "status", text: `Email de test envoyé à ${result.to}. Vérifiez votre boîte de réception.` };
    case "echec":
      return { kind: "alert", text: `Envoi impossible : ${result.errorReason ?? "motif inconnu"}. L'échec est consigné dans le journal.` };
  }
}

/** Paramètres → Envoi de test : vers l'adresse de l'administrateur connecté par défaut (contrat 30). */
export function TestSendForm({ defaultTo }: { defaultTo: string }) {
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [outcome, setOutcome] = useState<Outcome>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const to = String(new FormData(formElement).get("to") ?? "").trim();
    setOutcome(null);
    if (!to) return setFieldError("Le destinataire est requis.");
    if (!EMAIL_RE.test(to)) {
      setFieldError("Cette adresse n'est pas valide.");
      return formElement.querySelector<HTMLInputElement>("#test-to")?.focus();
    }
    setFieldError(undefined);
    setPending(true);
    const result = await callApi<Result>("/api/emails/test", { method: "POST", body: { to } });
    setPending(false);
    if (!result.ok) {
      if (result.failure.error === "destinataire_invalide") return setFieldError(result.failure.message);
      return setOutcome({ kind: "alert", text: result.failure.message });
    }
    setOutcome(describe(result.data));
  }

  return (
    <form className="grid max-w-md gap-4" aria-label="Envoi de test" onSubmit={onSubmit} noValidate>
      <div className="grid gap-2">
        <Label htmlFor="test-to">Destinataire</Label>
        <Input id="test-to" name="to" type="email" defaultValue={defaultTo} autoComplete="email" required aria-invalid={fieldError ? true : undefined} aria-describedby={fieldError ? "test-to-error" : "test-to-help"} />
        <FieldError id="test-to-error" text={fieldError} />
        {!fieldError && (
          <p id="test-to-help" className="text-xs text-muted-foreground">
            Votre adresse, pour vérifier que la configuration envoie vraiment.
          </p>
        )}
      </div>
      <OutcomeMessage outcome={outcome} />
      <div>
        <Button type="submit" disabled={pending}>
          Envoyer l&apos;email de test
        </Button>
      </div>
    </form>
  );
}
