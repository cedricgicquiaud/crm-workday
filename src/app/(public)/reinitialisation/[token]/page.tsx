import { and, eq, gt } from "drizzle-orm";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { verification } from "@/db/schema";
import { InvalidLink } from "@/features/auth/invalid-link";
import { ResetPasswordForm } from "@/features/auth/reset-password-form";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ token: string }> };

/** Better Auth range le jeton sous `reset-password:<jeton>` et le supprime à l'usage. */
async function isResetTokenValid(token: string): Promise<boolean> {
  const rows = await db
    .select({ id: verification.id })
    .from(verification)
    .where(and(eq(verification.identifier, `reset-password:${token}`), gt(verification.expiresAt, new Date())))
    .limit(1);
  return rows.length > 0;
}

/** Page du lien de réinitialisation : nouveau mot de passe si le lien vaut encore, « Lien invalide » sinon. */
export default async function ReinitialisationTokenPage({ params }: Props) {
  const { token } = await params;
  if (!(await isResetTokenValid(token))) return <InvalidLink />;
  return (
    <Card>
      <CardHeader>
        <h1 className="text-lg font-semibold leading-none">Choisissez un nouveau mot de passe</h1>
        <CardDescription>Vos autres sessions seront fermées.</CardDescription>
      </CardHeader>
      <CardContent>
        <ResetPasswordForm token={token} />
      </CardContent>
    </Card>
  );
}
