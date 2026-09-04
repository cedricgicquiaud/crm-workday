"use client";

import { useState, type FormEvent } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MIN_PASSWORD_LENGTH, PASSWORD_RULE } from "./password-rule";

type Props = {
  /** libellé du bouton d'envoi */
  submitLabel: string;
  /** Rend `null` si tout s'est bien passé, sinon le message à afficher. */
  onChoose: (password: string) => Promise<string | null>;
};

/** Choix d'un mot de passe (invitation, réinitialisation) : saisie, confirmation, règle des 12 caractères (D9). */
export function PasswordForm({ submitLabel, onChoose }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    const confirmation = String(form.get("confirmation") ?? "");
    if (password.length < MIN_PASSWORD_LENGTH) return setError(PASSWORD_RULE);
    if (password !== confirmation) return setError("Les deux mots de passe ne sont pas identiques.");
    setPending(true);
    setError(null);
    setError(await onChoose(password));
    setPending(false);
  }

  return (
    <form className="grid gap-4" aria-label="Choix du mot de passe" onSubmit={onSubmit} noValidate>
      <div className="grid gap-2">
        <Label htmlFor="password">Nouveau mot de passe</Label>
        <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={MIN_PASSWORD_LENGTH} aria-describedby="password-rule" />
        <p id="password-rule" className="text-xs text-muted-foreground">
          {MIN_PASSWORD_LENGTH} caractères au moins.
        </p>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="confirmation">Confirmation du mot de passe</Label>
        <Input id="confirmation" name="confirmation" type="password" autoComplete="new-password" required />
      </div>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <Button type="submit" disabled={pending}>
        {submitLabel}
      </Button>
    </form>
  );
}
