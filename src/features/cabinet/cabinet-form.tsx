"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { callApi } from "@/features/emails/api-client";
import { FieldError, OutcomeMessage, type Outcome } from "@/features/emails/outcome";
import type { CabinetSettings } from "@/lib/mail/settings";

type Field = keyof CabinetSettings;
type FieldErrors = Partial<Record<Field, string>>;

const FIELDS: { name: Field; id: string; label: string; help: string; type?: string; autoComplete?: string }[] = [
  { name: "name", id: "cabinet-name", label: "Nom du cabinet", help: "Remplace {{cabinet}} dans les emails.", autoComplete: "organization" },
  { name: "senderName", id: "cabinet-sender-name", label: "Nom d'affichage de l'expéditeur", help: "Ce que le destinataire voit avant l'adresse." },
  { name: "senderEmail", id: "cabinet-sender-email", label: "Adresse d'expédition", help: "Sur le domaine vérifié chez Resend. Aucun email ne part sans elle.", type: "email", autoComplete: "email" },
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Validation avant l'envoi : un message par champ fautif, sous le champ. */
function validate(values: CabinetSettings): FieldErrors {
  const errors: FieldErrors = {};
  if (!values.name) errors.name = "Le nom du cabinet est requis.";
  if (!values.senderName) errors.senderName = "Le nom d'affichage est requis.";
  if (!values.senderEmail) errors.senderEmail = "L'adresse d'expédition est requise.";
  else if (!EMAIL_RE.test(values.senderEmail)) errors.senderEmail = "Cette adresse n'est pas valide.";
  return errors;
}

/** Paramètres → Cabinet : nom, nom d'affichage et adresse d'expédition (D20, D21). */
export function CabinetForm({ initial }: { initial: CabinetSettings | null }) {
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [outcome, setOutcome] = useState<Outcome>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const values: CabinetSettings = {
      name: String(form.get("name") ?? "").trim(),
      senderName: String(form.get("senderName") ?? "").trim(),
      senderEmail: String(form.get("senderEmail") ?? "").trim(),
    };
    setOutcome(null);
    const errors = validate(values);
    setFieldErrors(errors);
    const firstInvalid = FIELDS.find((f) => errors[f.name]);
    if (firstInvalid) return formElement.querySelector<HTMLInputElement>(`#${firstInvalid.id}`)?.focus();
    setPending(true);
    const result = await callApi("/api/cabinet", { method: "PUT", body: values });
    setPending(false);
    setOutcome(result.ok ? { kind: "status", text: "Paramètres du cabinet enregistrés." } : { kind: "alert", text: result.failure.message });
  }

  return (
    <form className="grid max-w-md gap-4" aria-label="Cabinet" onSubmit={onSubmit} noValidate>
      {FIELDS.map((field) => {
        const errorText = fieldErrors[field.name];
        return (
          <div key={field.name} className="grid gap-2">
            <Label htmlFor={field.id}>{field.label}</Label>
            <Input
              id={field.id}
              name={field.name}
              type={field.type}
              autoComplete={field.autoComplete ?? "off"}
              defaultValue={initial?.[field.name] ?? ""}
              required
              aria-invalid={errorText ? true : undefined}
              aria-describedby={errorText ? `${field.id}-error` : `${field.id}-help`}
            />
            <FieldError id={`${field.id}-error`} text={errorText} />
            {!errorText && (
              <p id={`${field.id}-help`} className="text-xs text-muted-foreground">
                {field.help}
              </p>
            )}
          </div>
        );
      })}
      <OutcomeMessage outcome={outcome} />
      <div>
        <Button type="submit" disabled={pending}>
          Enregistrer
        </Button>
      </div>
    </form>
  );
}
