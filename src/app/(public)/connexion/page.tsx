import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { ConnexionForm } from "@/features/auth/connexion-form";
import { PASSWORD_CHANGED_QUERY } from "@/features/auth/routes";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ next?: string; [PASSWORD_CHANGED_QUERY]?: string }> };

/** Page de connexion ; `?next=` conserve la page demandée avant la redirection (contrat 19). */
export default async function ConnexionPage({ searchParams }: Props) {
  const { next, [PASSWORD_CHANGED_QUERY]: passwordChanged } = await searchParams;
  return (
    <Card>
      <CardHeader>
        <h1 className="text-lg font-semibold leading-none">Connexion</h1>
        <CardDescription>CRM Workday — accès réservé à l&apos;équipe du cabinet.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {passwordChanged && (
          <p role="status" className="text-sm">
            Votre mot de passe a été modifié. Connectez-vous.
          </p>
        )}
        <ConnexionForm next={next} />
      </CardContent>
    </Card>
  );
}
