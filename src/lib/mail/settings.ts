/**
 * Paramètres du cabinet (D20, D21) : une seule ligne en base. L'expéditeur des emails en est
 * tiré ; le nom du cabinet remplace `{{cabinet}}` dans les modèles.
 */
import { eq } from "drizzle-orm";
import { cabinetSettings } from "@/db/schema";
import { db } from "@/lib/db";

const SINGLE_ROW_ID = "cabinet";

export type CabinetSettings = { name: string; senderName: string; senderEmail: string };

export async function getCabinetSettings(): Promise<CabinetSettings | null> {
  const [row] = await db
    .select({ name: cabinetSettings.name, senderName: cabinetSettings.senderName, senderEmail: cabinetSettings.senderEmail })
    .from(cabinetSettings)
    .where(eq(cabinetSettings.id, SINGLE_ROW_ID))
    .limit(1);
  return row ?? null;
}

/** Enregistre ou remplace la ligne unique. */
export async function saveCabinetSettings(input: CabinetSettings): Promise<void> {
  const values = { name: input.name.trim(), senderName: input.senderName.trim(), senderEmail: input.senderEmail.trim().toLowerCase() };
  await db
    .insert(cabinetSettings)
    .values({ id: SINGLE_ROW_ID, ...values })
    .onConflictDoUpdate({ target: cabinetSettings.id, set: { ...values, updatedAt: new Date() } });
}
