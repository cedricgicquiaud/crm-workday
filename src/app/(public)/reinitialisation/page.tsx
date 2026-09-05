import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { ForgotPasswordForm } from "@/features/auth/forgot-password-form";

/** « Mot de passe oublié » : un lien d'une heure, à usage unique, envoyé par email (D9). */
export default function ReinitialisationPage() {
  return (
    <Card>
      <CardHeader>
        <h1 className="text-lg font-semibold leading-none">Mot de passe oublié</h1>
        <CardDescription>Indiquez votre email : vous recevrez un lien valable une heure.</CardDescription>
      </CardHeader>
      <CardContent>
        <ForgotPasswordForm />
      </CardContent>
    </Card>
  );
}
