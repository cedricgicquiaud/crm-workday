import { Button, Heading, Text } from "@react-email/components";
import { EmailLayout } from "./layout";

export type ReinitialisationProps = { prenom: string; nom: string; cabinet: string; lien: string };

export const reinitialisationSubject = () => "Réinitialisation de votre mot de passe";

export function ReinitialisationEmail({ prenom, cabinet, lien }: ReinitialisationProps) {
  return (
    <EmailLayout preview="Réinitialisation de votre mot de passe" cabinet={cabinet}>
      <Heading as="h1" style={{ fontSize: 20 }}>{`Bonjour ${prenom},`}</Heading>
      <Text>{`Vous avez demandé un nouveau mot de passe pour le CRM de ${cabinet}.`}</Text>
      <Button href={lien} style={{ backgroundColor: "#171717", borderRadius: 6, color: "#ffffff", padding: "10px 16px" }}>
        Choisir un nouveau mot de passe
      </Button>
      <Text style={{ color: "#737373", fontSize: 13 }}>Ce lien est valable 1 heure et ne sert qu&apos;une fois. Si vous n&apos;êtes pas à l&apos;origine de cette demande, ignorez cet email.</Text>
    </EmailLayout>
  );
}
