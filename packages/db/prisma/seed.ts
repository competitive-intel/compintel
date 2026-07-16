import { createDbClient } from "../src/index.js";
import { seedDatabase } from "./seed-data.js";

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined) {
  throw new Error("DATABASE_URL is required");
}

const db = createDbClient(databaseUrl);

try {
  await seedDatabase(db);
} finally {
  await db.$disconnect();
}
