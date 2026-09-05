"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth/client";
import Link from "next/link";
import { safeNext } from "./routes";

/** Un seul message de refus, quel que soit le motif : on ne révèle ni l'adresse ni le verrou (D14). */
export const SIGN_IN_ERROR = "Email ou mot de passe incorrect.";

export function ConnexionForm({ next }: { next?: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError(null);
    const { error: signInError } = await authClient.signIn.email({
      email: String(form.get("email") ?? ""),
      password: String(form.get("password") ?? ""),
    });
    setPending(false);
    if (signInError) {
      setError(SIGN_IN_ERROR);
      return;
    }
    router.push(safeNext(next, window.location.origin));
    router.refresh();
  }

  return (
    <form className="grid gap-4" aria-label="Formulaire de connexion" onSubmit={onSubmit} noValidate>
      <div className="grid gap-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required aria-invalid={error ? true : undefined} />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="password">Mot de passe</Label>
        <Input id="password" name="password" type="password" autoComplete="current-password" required aria-invalid={error ? true : undefined} />
      </div>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <Button type="submit" disabled={pending}>
        Se connecter
      </Button>
      <Link href="/reinitialisation" className="text-sm text-muted-foreground underline-offset-4 hover:underline">
        Mot de passe oublié ?
      </Link>
    </form>
  );
}
