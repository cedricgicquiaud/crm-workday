"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { MIN_PASSWORD_LENGTH, PASSWORD_RULE } from "@/features/auth/password-rule";

type Identity = { firstName: string; lastName: string; email: string };
type Outcome = { kind: "status" | "alert"; text: string } | null;

/** Envoi vers l'API du profil ; rend `null` si tout s'est bien passé, sinon le message à afficher. */
async function patchProfile(body: unknown): Promise<string | null> {
  const res = await fetch("/api/profile", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (res.ok) return null;
  const data = (await res.json().catch(() => null)) as { message?: string } | null;
  return data?.message ?? "L'enregistrement a échoué. Réessayez.";
}

function OutcomeMessage({ outcome }: { outcome: Outcome }) {
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

/** Mon profil : prénom et nom, puis mot de passe (ancien + nouveau, règle des 12 caractères) (D13, D9). */
export function ProfileForm() {
  const router = useRouter();
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [identityOutcome, setIdentityOutcome] = useState<Outcome>(null);
  const [passwordOutcome, setPasswordOutcome] = useState<Outcome>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/profile")
      .then((res) => (res.ok ? (res.json() as Promise<Identity>) : Promise.reject(new Error(String(res.status)))))
      .then((data) => {
        if (!cancelled) setIdentity(data);
      })
      .catch(() => {
        if (!cancelled) setIdentityOutcome({ kind: "alert", text: "Impossible de lire votre profil. Rechargez la page." });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function saveIdentity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const firstName = String(form.get("firstName") ?? "").trim();
    const lastName = String(form.get("lastName") ?? "").trim();
    if (!firstName || !lastName) return setIdentityOutcome({ kind: "alert", text: "Le prénom et le nom sont requis." });
    setPending(true);
    const error = await patchProfile({ firstName, lastName });
    setPending(false);
    setIdentityOutcome(error ? { kind: "alert", text: error } : { kind: "status", text: "Profil enregistré." });
    if (!error) {
      setIdentity((current) => (current ? { ...current, firstName, lastName } : current));
      router.refresh();
    }
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const currentPassword = String(form.get("currentPassword") ?? "");
    const newPassword = String(form.get("newPassword") ?? "");
    const confirmation = String(form.get("confirmation") ?? "");
    if (newPassword.length < MIN_PASSWORD_LENGTH) return setPasswordOutcome({ kind: "alert", text: PASSWORD_RULE });
    if (newPassword !== confirmation) return setPasswordOutcome({ kind: "alert", text: "Les deux mots de passe ne sont pas identiques." });
    setPending(true);
    const error = await patchProfile({ currentPassword, newPassword });
    setPending(false);
    setPasswordOutcome(error ? { kind: "alert", text: error } : { kind: "status", text: "Mot de passe modifié." });
    if (!error) formElement.reset();
  }

  return (
    <div className="grid gap-6">
      <form className="grid max-w-md gap-4" aria-label="Identité" onSubmit={saveIdentity} noValidate>
        {identity ? (
          <>
            <div className="grid gap-2">
              <Label htmlFor="profile-first-name">Prénom</Label>
              <Input id="profile-first-name" name="firstName" defaultValue={identity.firstName} autoComplete="given-name" required />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="profile-last-name">Nom</Label>
              <Input id="profile-last-name" name="lastName" defaultValue={identity.lastName} autoComplete="family-name" required />
            </div>
            <p className="text-xs text-muted-foreground">Email de connexion : {identity.email}. Il ne se modifie pas ici.</p>
          </>
        ) : (
          <div className="grid gap-2" aria-busy>
            <Skeleton className="h-8" />
            <Skeleton className="h-8" />
          </div>
        )}
        <OutcomeMessage outcome={identityOutcome} />
        <div>
          <Button type="submit" variant="outline" disabled={pending || !identity}>
            Enregistrer
          </Button>
        </div>
      </form>

      <form className="grid max-w-md gap-4" aria-label="Mot de passe" onSubmit={changePassword} noValidate>
        <h3 className="text-sm font-medium">Changer le mot de passe</h3>
        <div className="grid gap-2">
          <Label htmlFor="current-password">Mot de passe actuel</Label>
          <Input id="current-password" name="currentPassword" type="password" autoComplete="current-password" required />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="new-password">Nouveau mot de passe</Label>
          <Input id="new-password" name="newPassword" type="password" autoComplete="new-password" required minLength={MIN_PASSWORD_LENGTH} aria-describedby="new-password-rule" />
          <p id="new-password-rule" className="text-xs text-muted-foreground">
            {MIN_PASSWORD_LENGTH} caractères au moins.
          </p>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="new-password-confirmation">Confirmation du nouveau mot de passe</Label>
          <Input id="new-password-confirmation" name="confirmation" type="password" autoComplete="new-password" required />
        </div>
        <OutcomeMessage outcome={passwordOutcome} />
        <div>
          <Button type="submit" variant="outline" disabled={pending}>
            Changer le mot de passe
          </Button>
        </div>
      </form>
    </div>
  );
}
