import { Button, Heading, Text } from "@react-email/components";
import { EmailLayout } from "./layout";

export type TemplateEmailProps = {
  /** texte d'aperçu du client mail, en général le sujet rendu */
  preview: string;
  /** nom du cabinet, en pied */
  cabinet: string;
  /** corps du modèle, variables déjà remplacées ; paragraphes séparés par une ligne vide */
  body: string;
};

/** Un paragraphe réduit à `[libellé](url)` devient un bouton. */
const BUTTON_RE = /^\[([^\]]+)\]\((\S+)\)$/;

const BUTTON_STYLE = { backgroundColor: "#171717", borderRadius: 6, color: "#ffffff", padding: "10px 16px" };

/**
 * Cadre commun autour du texte d'un modèle en base : le premier paragraphe est le titre,
 * les suivants du texte, un `[libellé](url)` seul sur son paragraphe un bouton.
 * Chaque paragraphe est rendu d'une seule chaîne : pas de commentaire `<!-- -->` dans le HTML.
 */
export function TemplateEmail({ preview, cabinet, body }: TemplateEmailProps) {
  const [title, ...paragraphs] = body.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  return (
    <EmailLayout preview={preview} cabinet={cabinet}>
      {title && <Heading as="h1" style={{ fontSize: 20 }}>{title}</Heading>}
      {paragraphs.map((paragraph, index) => {
        const button = BUTTON_RE.exec(paragraph);
        if (button) {
          return (
            <Button key={index} href={button[2]} style={BUTTON_STYLE}>
              {button[1]}
            </Button>
          );
        }
        return <Text key={index}>{paragraph}</Text>;
      })}
    </EmailLayout>
  );
}
