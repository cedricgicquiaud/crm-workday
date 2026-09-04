import { Body, Container, Head, Html, Preview, Section, Text } from "@react-email/components";
import type { ReactNode } from "react";

/** Cadre commun des emails : sobre, lisible sans images. */
export function EmailLayout({ preview, cabinet, children }: { preview: string; cabinet: string; children: ReactNode }) {
  return (
    <Html lang="fr">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={{ backgroundColor: "#f5f5f5", fontFamily: "Inter, Helvetica, Arial, sans-serif", margin: 0 }}>
        <Container style={{ backgroundColor: "#ffffff", margin: "24px auto", maxWidth: 560, padding: 24 }}>
          <Section>{children}</Section>
          <Text style={{ color: "#737373", fontSize: 12, marginTop: 24 }}>{cabinet}</Text>
        </Container>
      </Body>
    </Html>
  );
}
