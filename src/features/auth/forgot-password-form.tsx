"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth/client";

/** Toujours la même phrase, compte connu ou non : on ne révèle pas l'existence d'une adresse (D9). */
export const FORGOT_PASSWORD_SENT = "Si un compte existe pour cette adresse, un email vient de partir.";

export function ForgotPasswordForm() {
  const [sent, setSent] = useState(false);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = String(new FormData(event.currentTarget).get("email") ?? "");
    setPending(true);
    await authClient.requestPasswordReset({ email });
    setPending(false);
    setSent(true);
  }

  if (sent) {
    return (
      <p role="status" className="text-sm">
        {FORGOT_PASSWORD_SENT}
      </p>
    );
  }

  return (
    <form className="grid gap-4" aria-label="Mot de passe oublié" onSubmit={onSubmit} noValidate>
      <div className="grid gap-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </div>
      <Button type="submit" disabled={pending}>
        Envoyer le lien
      </Button>
    </form>
  );
}
