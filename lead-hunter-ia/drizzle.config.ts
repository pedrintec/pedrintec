import { defineConfig } from "drizzle-kit";

// Configuração do Drizzle Kit (usada por `npm run db:studio`).
// A criação das tabelas em si é feita por `npm run db:migrate`
// (src/database/migrate.ts), que é 100% não-interativo e idempotente.
export default defineConfig({
  dialect: "sqlite",
  schema: "./src/database/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_PATH ?? "./data/lead-hunter.db",
  },
});
