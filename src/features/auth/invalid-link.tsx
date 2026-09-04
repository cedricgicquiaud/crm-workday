import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";

/** Lien d'invitation ou de réinitialisation utilisé ou expiré : rien n'est possible (contrat 12). */
export function InvalidLink() {
  return (
    <Card>
      <CardHeader>
        <h1 className="text-lg font-semibold leading-none">Lien invalide</h1>
        <CardDescription>Ce lien a déjà été utilisé ou a expiré.</CardDescription>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        Demandez un nouveau lien à un administrateur, ou{" "}
        <Link href="/reinitialisation" className="underline underline-offset-4 hover:text-foreground">
          réinitialisez votre mot de passe
        </Link>{" "}
        si vous avez déjà un compte.
      </CardContent>
    </Card>
  );
}
