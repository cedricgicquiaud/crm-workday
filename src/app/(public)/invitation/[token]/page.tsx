import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { InvalidLink } from "@/features/auth/invalid-link";
import { InvitationForm } from "@/features/auth/invitation-form";
import { findValidInvitation } from "@/features/auth/invitations";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ token: string }> };

/** Page du lien d'invitation : choix du mot de passe si le lien vaut encore, « Lien invalide » sinon. */
export default async function InvitationPage({ params }: Props) {
  const { token } = await params;
  const valid = await findValidInvitation(token);
  if (!valid) return <InvalidLink />;
  return (
    <Card>
      <CardHeader>
        <h1 className="text-lg font-semibold leading-none">Choisissez votre mot de passe</h1>
        <CardDescription>{`Votre compte ${valid.email} sera activé et vous serez connecté.`}</CardDescription>
      </CardHeader>
      <CardContent>
        <InvitationForm token={token} />
      </CardContent>
    </Card>
  );
}
