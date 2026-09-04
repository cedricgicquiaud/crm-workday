import { loadDotenv } from "../src/lib/dotenv";
import { resetTestDb } from "./helpers/db";

/** Une fois par exécution : base de test remise à zéro puis migrée (décision D3). */
export default async function globalSetup() {
  Object.assign(process.env, { NODE_ENV: "test" });
  loadDotenv();
  await resetTestDb();
}
