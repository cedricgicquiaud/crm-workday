"use client";

import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth/client";
import { PasswordForm } from "./password-form";
import { PASSWORD_RULE } from "./password-rule";
import { PASSWORD_CHANGED_QUERY } from "./routes";

/** Nouveau mot de passe depuis le lien reçu ; le lien est consommé, l'ancien mot de passe ne vaut plus (contrat 9). */
export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();

  async function choose(newPassword: string): Promise<string | null> {
    const { error } = await authClient.resetPassword({ newPassword, token });
    if (!error) {
      router.push(`/connexion?${PASSWORD_CHANGED_QUERY}=1`);
      return null;
    }
    return error.code === "PASSWORD_TOO_SHORT" ? PASSWORD_RULE : "Ce lien est invalide : déjà utilisé ou expiré.";
  }

  return <PasswordForm submitLabel="Changer le mot de passe" onChoose={choose} />;
}
