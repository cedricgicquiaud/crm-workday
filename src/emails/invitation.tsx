import { Button, Heading, Text } from "@react-email/components";
import { EmailLayout } from "./layout";

export type InvitationProps = { prenom: string; nom: string; cabinet: string; lien: string };

export const invitationSubject = ({ cabinet }: InvitationProps) => `Votre accès au CRM de ${cabinet}`;

export function InvitationEmail({ prenom, cabinet, lien }: InvitationProps) {
  return (
    <EmailLayout preview={`Votre accès au CRM de ${cabinet}`} cabinet={cabinet}>
      <Heading as="h1" style={{ fontSize: 20 }}>{`Bonjour ${prenom},`}</Heading>
      <Text>{`Un compte vient d'être créé pour vous sur le CRM de ${cabinet}. Choisissez votre mot de passe pour y entrer.`}</Text>
      <Button href={lien} style={{ backgroundColor: "#171717", borderRadius: 6, color: "#ffffff", padding: "10px 16px" }}>
        Choisir mon mot de passe
      </Button>
      <Text style={{ color: "#737373", fontSize: 13 }}>Ce lien est valable 72 heures et ne sert qu&apos;une fois.</Text>
    </EmailLayout>
  );
}
