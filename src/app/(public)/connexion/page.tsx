import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { ConnexionForm } from "@/features/auth/connexion-form";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ next?: string }> };

/** Page de connexion ; `?next=` conserve la page demandée avant la redirection (contrat 19). */
export default async function ConnexionPage({ searchParams }: Props) {
  const { next } = await searchParams;
  return (
    <Card>
      <CardHeader>
        <h1 className="text-lg font-semibold leading-none">Connexion</h1>
        <CardDescription>CRM Workday — accès réservé à l&apos;équipe du cabinet.</CardDescription>
      </CardHeader>
      <CardContent>
        <ConnexionForm next={next} />
      </CardContent>
    </Card>
  );
}
