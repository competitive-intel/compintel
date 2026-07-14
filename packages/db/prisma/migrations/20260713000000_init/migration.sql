CREATE TYPE "PlayerKind" AS ENUM ('USER', 'PLATFORM');
CREATE TYPE "PlayerLanguage" AS ENUM ('CPP');
CREATE TYPE "EvaluationStatus" AS ENUM ('QUEUED', 'COMPILING', 'RUNNING', 'FINISHED');
CREATE TYPE "EvaluationVerdict" AS ENUM ('ACCEPTED', 'COMPILE_ERROR', 'RUNTIME_ERROR', 'TIME_LIMIT_EXCEEDED', 'MEMORY_LIMIT_EXCEEDED', 'OUTPUT_LIMIT_EXCEEDED', 'DANGEROUS_SYSCALL', 'INVALID_MOVE', 'INTERNAL_ERROR');
CREATE TYPE "MatchStatus" AS ENUM ('QUEUED', 'RUNNING', 'FINISHED');
CREATE TYPE "MatchOutcome" AS ENUM ('WIN', 'LOSS', 'DRAW', 'ERROR');
CREATE TYPE "UserRole" AS ENUM ('USER', 'ADMIN');
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

CREATE TABLE "User" (
  "id" TEXT NOT NULL,
  "username" TEXT NOT NULL,
  "displayName" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "role" "UserRole" NOT NULL DEFAULT 'USER',
  "approvalStatus" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
  "reviewedAt" TIMESTAMP(3),
  "reviewedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Session" (
  "id" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Game" (
  "id" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "rulesMarkdown" TEXT NOT NULL,
  "rulesVersion" TEXT NOT NULL,
  "moveCpuLimitMs" INTEGER NOT NULL DEFAULT 100,
  "totalCpuLimitMs" INTEGER NOT NULL DEFAULT 5000,
  "memoryLimitMiB" INTEGER NOT NULL DEFAULT 256,
  "isPublished" BOOLEAN NOT NULL DEFAULT false,
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
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "weight" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Player_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Player_weight_positive" CHECK ("weight" > 0)
);

CREATE TABLE "PlayerVersion" (
  "id" TEXT NOT NULL,
  "playerId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "language" "PlayerLanguage" NOT NULL,
  "sourceCode" TEXT NOT NULL,
  "sourceSha256" TEXT NOT NULL,
  "score" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PlayerVersion_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PlayerVersion_score_range" CHECK ("score" IS NULL OR ("score" >= 0 AND "score" <= 100))
);

CREATE TABLE "Evaluation" (
  "id" TEXT NOT NULL,
  "playerVersionId" TEXT NOT NULL,
  "opponentVersionId" TEXT NOT NULL,
  "opponentWeight" INTEGER NOT NULL DEFAULT 1,
  "won" BOOLEAN NOT NULL DEFAULT false,
  "status" "EvaluationStatus" NOT NULL DEFAULT 'QUEUED',
  "verdict" "EvaluationVerdict",
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "compileStatus" TEXT,
  "compileLog" TEXT,
  "opponentCompileStatus" TEXT,
  "opponentCompileLog" TEXT,
  "runStatus" TEXT,
  "opponentRunStatus" TEXT,
  "stdout" TEXT,
  "stderr" TEXT,
  "opponentStderr" TEXT,
  "cpuTimeNs" BIGINT,
  "wallTimeNs" BIGINT,
  "memoryBytes" BIGINT,
  "opponentCpuTimeNs" BIGINT,
  "opponentWallTimeNs" BIGINT,
  "opponentMemoryBytes" BIGINT,
  "errorMessage" TEXT,
  "replay" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "startedAt" TIMESTAMP(3),
  "finishedAt" TIMESTAMP(3),
  CONSTRAINT "Evaluation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Evaluation_opponentWeight_positive" CHECK ("opponentWeight" > 0)
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

CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
CREATE INDEX "User_approvalStatus_createdAt_idx" ON "User"("approvalStatus", "createdAt");
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");
CREATE INDEX "Session_userId_idx" ON "Session"("userId");
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");
CREATE UNIQUE INDEX "Game_slug_key" ON "Game"("slug");
CREATE INDEX "Game_isPublished_createdAt_idx" ON "Game"("isPublished", "createdAt");
CREATE UNIQUE INDEX "Player_gameId_ownerId_name_key" ON "Player"("gameId", "ownerId", "name");
CREATE UNIQUE INDEX "Player_platform_gameId_name_key" ON "Player"("gameId", "name") WHERE "kind" = 'PLATFORM';
CREATE INDEX "Player_gameId_kind_idx" ON "Player"("gameId", "kind");
CREATE UNIQUE INDEX "PlayerVersion_playerId_version_key" ON "PlayerVersion"("playerId", "version");
CREATE INDEX "Evaluation_playerVersionId_createdAt_idx" ON "Evaluation"("playerVersionId", "createdAt");
CREATE INDEX "Evaluation_opponentVersionId_idx" ON "Evaluation"("opponentVersionId");
CREATE INDEX "Evaluation_status_createdAt_idx" ON "Evaluation"("status", "createdAt");
CREATE INDEX "Match_gameId_createdAt_idx" ON "Match"("gameId", "createdAt");
CREATE UNIQUE INDEX "MatchParticipant_matchId_seat_key" ON "MatchParticipant"("matchId", "seat");
CREATE UNIQUE INDEX "MatchParticipant_matchId_playerVersionId_key" ON "MatchParticipant"("matchId", "playerVersionId");

ALTER TABLE "User" ADD CONSTRAINT "User_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Player" ADD CONSTRAINT "Player_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Player" ADD CONSTRAINT "Player_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PlayerVersion" ADD CONSTRAINT "PlayerVersion_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Evaluation" ADD CONSTRAINT "Evaluation_playerVersionId_fkey" FOREIGN KEY ("playerVersionId") REFERENCES "PlayerVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Evaluation" ADD CONSTRAINT "Evaluation_opponentVersionId_fkey" FOREIGN KEY ("opponentVersionId") REFERENCES "PlayerVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Match" ADD CONSTRAINT "Match_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MatchParticipant" ADD CONSTRAINT "MatchParticipant_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MatchParticipant" ADD CONSTRAINT "MatchParticipant_playerVersionId_fkey" FOREIGN KEY ("playerVersionId") REFERENCES "PlayerVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
