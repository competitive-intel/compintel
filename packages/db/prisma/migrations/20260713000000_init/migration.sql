CREATE TYPE "PlayerKind" AS ENUM ('USER', 'PLATFORM');
CREATE TYPE "PlayerLanguage" AS ENUM ('CPP', 'BUILTIN');
CREATE TYPE "EvaluationStatus" AS ENUM ('QUEUED', 'COMPILING', 'RUNNING', 'FINISHED');
CREATE TYPE "EvaluationVerdict" AS ENUM ('ACCEPTED', 'COMPILE_ERROR', 'RUNTIME_ERROR', 'TIME_LIMIT_EXCEEDED', 'MEMORY_LIMIT_EXCEEDED', 'OUTPUT_LIMIT_EXCEEDED', 'DANGEROUS_SYSCALL', 'INVALID_MOVE', 'INTERNAL_ERROR');
CREATE TYPE "MatchStatus" AS ENUM ('QUEUED', 'RUNNING', 'FINISHED');
CREATE TYPE "MatchOutcome" AS ENUM ('WIN', 'LOSS', 'DRAW', 'ERROR');

CREATE TABLE "User" (
  "id" TEXT NOT NULL,
  "externalId" TEXT NOT NULL,
  "displayName" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Game" (
  "id" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "rulesVersion" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Game_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Player" (
  "id" TEXT NOT NULL,
  "gameId" TEXT NOT NULL,
  "ownerId" TEXT,
  "kind" "PlayerKind" NOT NULL,
  "name" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Player_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PlayerVersion" (
  "id" TEXT NOT NULL,
  "playerId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "language" "PlayerLanguage" NOT NULL,
  "sourceCode" TEXT,
  "sourceSha256" TEXT,
  "implementationKey" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PlayerVersion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Evaluation" (
  "id" TEXT NOT NULL,
  "playerVersionId" TEXT NOT NULL,
  "status" "EvaluationStatus" NOT NULL DEFAULT 'QUEUED',
  "verdict" "EvaluationVerdict",
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "compileStatus" TEXT,
  "compileLog" TEXT,
  "runStatus" TEXT,
  "stdout" TEXT,
  "stderr" TEXT,
  "cpuTimeNs" BIGINT,
  "wallTimeNs" BIGINT,
  "memoryBytes" BIGINT,
  "errorMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "startedAt" TIMESTAMP(3),
  "finishedAt" TIMESTAMP(3),
  CONSTRAINT "Evaluation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Match" (
  "id" TEXT NOT NULL,
  "gameId" TEXT NOT NULL,
  "status" "MatchStatus" NOT NULL DEFAULT 'QUEUED',
  "replayKey" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "startedAt" TIMESTAMP(3),
  "finishedAt" TIMESTAMP(3),
  CONSTRAINT "Match_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MatchParticipant" (
  "id" TEXT NOT NULL,
  "matchId" TEXT NOT NULL,
  "playerVersionId" TEXT NOT NULL,
  "seat" INTEGER NOT NULL,
  "outcome" "MatchOutcome",
  "detail" JSONB,
  CONSTRAINT "MatchParticipant_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "User_externalId_key" ON "User"("externalId");
CREATE UNIQUE INDEX "Game_slug_key" ON "Game"("slug");
CREATE UNIQUE INDEX "Player_gameId_ownerId_name_key" ON "Player"("gameId", "ownerId", "name");
CREATE INDEX "Player_gameId_kind_idx" ON "Player"("gameId", "kind");
CREATE UNIQUE INDEX "PlayerVersion_playerId_version_key" ON "PlayerVersion"("playerId", "version");
CREATE INDEX "Evaluation_playerVersionId_createdAt_idx" ON "Evaluation"("playerVersionId", "createdAt");
CREATE INDEX "Evaluation_status_createdAt_idx" ON "Evaluation"("status", "createdAt");
CREATE INDEX "Match_gameId_createdAt_idx" ON "Match"("gameId", "createdAt");
CREATE UNIQUE INDEX "MatchParticipant_matchId_seat_key" ON "MatchParticipant"("matchId", "seat");
CREATE UNIQUE INDEX "MatchParticipant_matchId_playerVersionId_key" ON "MatchParticipant"("matchId", "playerVersionId");

ALTER TABLE "Player" ADD CONSTRAINT "Player_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Player" ADD CONSTRAINT "Player_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PlayerVersion" ADD CONSTRAINT "PlayerVersion_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Evaluation" ADD CONSTRAINT "Evaluation_playerVersionId_fkey" FOREIGN KEY ("playerVersionId") REFERENCES "PlayerVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Match" ADD CONSTRAINT "Match_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MatchParticipant" ADD CONSTRAINT "MatchParticipant_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MatchParticipant" ADD CONSTRAINT "MatchParticipant_playerVersionId_fkey" FOREIGN KEY ("playerVersionId") REFERENCES "PlayerVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
