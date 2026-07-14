import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../generated/client/client.js";

export * from "../generated/client/client.js";
export * from "./evaluation-scoring.js";

export function createDbClient(databaseUrl: string): PrismaClient {
  const adapter = new PrismaPg(databaseUrl);
  return new PrismaClient({ adapter });
}
