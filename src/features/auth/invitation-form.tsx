"use client";

import { useRouter } from "next/navigation";
import { PasswordForm } from "./password-form";

/** Acceptation d'une invitation : le mot de passe choisi connecte l'invité et l'amène sur Accueil (contrat 6). */
export function InvitationForm({ token }: { token: string }) {
  const router = useRouter();

  async function choose(password: string): Promise<string | null> {
    const res = await fetch(`/api/invitations/${encodeURIComponent(token)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (res.ok) {
      router.push("/accueil");
      router.refresh();
      return null;
    }
    const body = (await res.json().catch(() => null)) as { message?: string } | null;
    return body?.message ?? "Ce lien est invalide : déjà utilisé ou expiré.";
  }

  return <PasswordForm submitLabel="Choisir ce mot de passe" onChoose={choose} />;
}
