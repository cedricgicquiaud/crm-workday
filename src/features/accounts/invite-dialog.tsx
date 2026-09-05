"use client";

import { useState, type FormEvent } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import type { Role } from "@/features/auth/accounts";
import { callApi, type ApiFailure } from "./api-client";
import { ROLE_LABELS } from "./labels";

type Props = { onInvited: (email: string) => void; onReactivated: (name: string) => void };

type TextField = "email" | "firstName" | "lastName";
type FieldErrors = Partial<Record<TextField, string>>;

const FIELDS: { name: TextField; id: string; label: string; type?: string }[] = [
  { name: "email", id: "invite-email", label: "Email", type: "email" },
  { name: "firstName", id: "invite-first-name", label: "Prénom" },
  { name: "lastName", id: "invite-last-name", label: "Nom" },
];

/** Validation du formulaire avant l'envoi : un message par champ fautif, sous le champ (fondations « Formulaires »). */
function validate(values: Record<TextField, string>): FieldErrors {
  const errors: FieldErrors = {};
  if (!values.email) errors.email = "L'email est requis.";
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) errors.email = "Cet email n'est pas valide.";
  if (!values.firstName) errors.firstName = "Le prénom est requis.";
  if (!values.lastName) errors.lastName = "Le nom est requis.";
  return errors;
}

/** Création rapide en Dialog (4 champs) : le compte naît « invité », la personne reçoit son lien (D7). */
export function InviteDialog({ onInvited, onReactivated }: Props) {
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<Role>("membre");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  const [pending, setPending] = useState(false);
  /** Refus du serveur (email déjà pris, erreur inattendue) : le seul message global. */
  const error = failure?.message ?? null;
  /** Email déjà pris par un compte désactivé : on propose de le réactiver plutôt que de le recréer (D12). */
  const reactivable = failure?.status === "desactive" && failure.accountId ? failure : null;

  function reset(next: boolean) {
    setOpen(next);
    if (!next) {
      setFieldErrors({});
      setFailure(null);
      setRole("membre");
    }
  }

  async function reactivate() {
    if (!reactivable?.accountId) return;
    setPending(true);
    const result = await callApi(`/api/accounts/${encodeURIComponent(reactivable.accountId)}`, { method: "PATCH", body: { status: "actif" } });
    setPending(false);
    if (!result.ok) return setFailure(result.failure);
    reset(false);
    onReactivated(reactivable.name ?? "");
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const values = { email: String(form.get("email") ?? "").trim(), firstName: String(form.get("firstName") ?? "").trim(), lastName: String(form.get("lastName") ?? "").trim() };
    setFailure(null);
    const errors = validate(values);
    setFieldErrors(errors);
    const firstInvalid = FIELDS.find((f) => errors[f.name]);
    if (firstInvalid) return formElement.querySelector<HTMLInputElement>(`#${firstInvalid.id}`)?.focus();
    setPending(true);
    const result = await callApi("/api/accounts", { method: "POST", body: { ...values, role } });
    setPending(false);
    if (!result.ok) return setFailure(result.failure);
    reset(false);
    onInvited(values.email);
  }

  return (
    <Dialog open={open} onOpenChange={reset}>
      <DialogTrigger render={<Button />}>Inviter</DialogTrigger>
      <DialogContent>
        <form className="grid gap-4" onSubmit={onSubmit} noValidate>
          <DialogHeader>
            <DialogTitle>Inviter une personne</DialogTitle>
            <DialogDescription>Elle recevra un email avec un lien de 72 heures pour choisir son mot de passe.</DialogDescription>
          </DialogHeader>
          {FIELDS.map((field) => {
            const fieldError = fieldErrors[field.name];
            /* Un email déjà pris est un refus du serveur sur ce champ : il se marque en erreur, le message reste global. */
            const invalid = Boolean(fieldError) || (field.name === "email" && Boolean(error));
            return (
              <div key={field.name} className="grid gap-2">
                <Label htmlFor={field.id}>{field.label}</Label>
                <Input
                  id={field.id}
                  name={field.name}
                  type={field.type}
                  autoComplete="off"
                  required
                  aria-invalid={invalid || undefined}
                  aria-describedby={fieldError ? `${field.id}-error` : undefined}
                />
                {fieldError && (
                  <p id={`${field.id}-error`} className="text-xs text-danger">
                    {fieldError}
                  </p>
                )}
              </div>
            );
          })}
          <fieldset className="grid gap-2">
            <legend className="text-sm font-medium">Rôle</legend>
            <RadioGroup value={role} onValueChange={(value) => setRole(value as Role)} className="flex gap-4">
              {(Object.keys(ROLE_LABELS) as Role[]).map((value) => (
                <div key={value} className="flex items-center gap-2">
                  <RadioGroupItem value={value} id={`invite-role-${value}`} />
                  <Label htmlFor={`invite-role-${value}`}>{ROLE_LABELS[value]}</Label>
                </div>
              ))}
            </RadioGroup>
          </fieldset>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => reset(false)}>
              Annuler
            </Button>
            {reactivable ? (
              <Button type="button" variant="outline" disabled={pending} onClick={reactivate}>
                Réactiver ce compte
              </Button>
            ) : null}
            <Button type="submit" disabled={pending}>
              Envoyer l&apos;invitation
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
