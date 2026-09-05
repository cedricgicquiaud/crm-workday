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
type ApiError = { error?: string; message: string };

type PasswordField = "currentPassword" | "newPassword" | "confirmation";
type PasswordErrors = Partial<Record<PasswordField, string>>;

const PASSWORD_IDS: Record<PasswordField, string> = { currentPassword: "current-password", newPassword: "new-password", confirmation: "new-password-confirmation" };

/** Codes d'erreur du serveur rattachés à un champ : le message s'affiche sous ce champ, pas en encadré global. */
const PASSWORD_ERROR_FIELDS: Record<string, PasswordField> = { mot_de_passe_actuel_incorrect: "currentPassword", mot_de_passe_trop_court: "newPassword" };

/** Envoi vers l'API du profil ; rend `null` si tout s'est bien passé, sinon l'erreur à afficher. */
async function patchProfile(body: unknown): Promise<ApiError | null> {
  const res = await fetch("/api/profile", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (res.ok) return null;
  const data = (await res.json().catch(() => null)) as Partial<ApiError> | null;
  return { error: data?.error, message: data?.message ?? "L'enregistrement a échoué. Réessayez." };
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

/** Message d'erreur sous le champ concerné (11 px, couleur danger), annoncé à l'affichage. */
function FieldError({ id, text }: { id: string; text?: string }) {
  if (!text) return null;
  return (
    <p id={id} role="alert" className="text-xs text-danger">
      {text}
    </p>
  );
}

/** Mon profil : prénom et nom, puis mot de passe (ancien + nouveau, règle des 12 caractères) (D13, D9). */
export function ProfileForm() {
  const router = useRouter();
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [identityOutcome, setIdentityOutcome] = useState<Outcome>(null);
  const [passwordErrors, setPasswordErrors] = useState<PasswordErrors>({});
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
    setIdentityOutcome(error ? { kind: "alert", text: error.message } : { kind: "status", text: "Profil enregistré." });
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
    setPasswordOutcome(null);
    const errors: PasswordErrors = {};
    if (newPassword.length < MIN_PASSWORD_LENGTH) errors.newPassword = PASSWORD_RULE;
    else if (newPassword !== confirmation) errors.confirmation = "Les deux mots de passe ne sont pas identiques.";
    setPasswordErrors(errors);
    if (errors.newPassword || errors.confirmation) return;
    setPending(true);
    const error = await patchProfile({ currentPassword, newPassword });
    setPending(false);
    if (!error) {
      setPasswordOutcome({ kind: "status", text: "Mot de passe modifié." });
      return formElement.reset();
    }
    const field = error.error ? PASSWORD_ERROR_FIELDS[error.error] : undefined;
    if (field) setPasswordErrors({ [field]: error.message });
    else setPasswordOutcome({ kind: "alert", text: error.message });
  }

  /** Champ du formulaire de mot de passe, avec son erreur éventuelle sous lui. */
  function passwordInput(name: PasswordField, label: string, autoComplete: string, extra?: { rule?: string }) {
    const id = PASSWORD_IDS[name];
    const errorText = passwordErrors[name];
    const describedBy = [errorText ? `${id}-error` : null, extra?.rule ? `${id}-rule` : null].filter(Boolean).join(" ") || undefined;
    return (
      <div className="grid gap-2">
        <Label htmlFor={id}>{label}</Label>
        <Input id={id} name={name} type="password" autoComplete={autoComplete} required aria-invalid={errorText ? true : undefined} aria-describedby={describedBy} />
        <FieldError id={`${id}-error`} text={errorText} />
        {extra?.rule && !errorText && (
          <p id={`${id}-rule`} className="text-xs text-muted-foreground">
            {extra.rule}
          </p>
        )}
      </div>
    );
  }

  return (
    /* `pt-2` : la page espace son titre de section de 8 px ; on complète à 16 px entre le titre et le premier libellé. */
    <div className="grid gap-6 pt-2">
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
        <h3 className="text-base font-medium">Changer le mot de passe</h3>
        {passwordInput("currentPassword", "Mot de passe actuel", "current-password")}
        {passwordInput("newPassword", "Nouveau mot de passe", "new-password", { rule: `${MIN_PASSWORD_LENGTH} caractères au moins.` })}
        {passwordInput("confirmation", "Confirmation du nouveau mot de passe", "new-password")}
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
