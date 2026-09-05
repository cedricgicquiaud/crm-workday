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

/** Création rapide en Dialog (4 champs) : le compte naît « invité », la personne reçoit son lien (D7). */
export function InviteDialog({ onInvited, onReactivated }: Props) {
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<Role>("membre");
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  const [pending, setPending] = useState(false);
  const error = failure?.message ?? null;
  /** Email déjà pris par un compte désactivé : on propose de le réactiver plutôt que de le recréer (D12). */
  const reactivable = failure?.status === "desactive" && failure.accountId ? failure : null;

  function reset(next: boolean) {
    setOpen(next);
    if (!next) {
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
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    setPending(true);
    setFailure(null);
    const result = await callApi("/api/accounts", {
      method: "POST",
      body: { email, firstName: String(form.get("firstName") ?? ""), lastName: String(form.get("lastName") ?? ""), role },
    });
    setPending(false);
    if (!result.ok) return setFailure(result.failure);
    reset(false);
    onInvited(email);
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
          <div className="grid gap-2">
            <Label htmlFor="invite-email">Email</Label>
            <Input id="invite-email" name="email" type="email" autoComplete="off" required aria-invalid={error ? true : undefined} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="invite-first-name">Prénom</Label>
            <Input id="invite-first-name" name="firstName" autoComplete="off" required />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="invite-last-name">Nom</Label>
            <Input id="invite-last-name" name="lastName" autoComplete="off" required />
          </div>
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
