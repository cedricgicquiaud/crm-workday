import { loadDotenv } from "@/lib/dotenv";

// Les tests travaillent toujours sur TEST_DATABASE_URL (voir src/lib/env.ts).
Object.assign(process.env, { NODE_ENV: "test" });
loadDotenv();
