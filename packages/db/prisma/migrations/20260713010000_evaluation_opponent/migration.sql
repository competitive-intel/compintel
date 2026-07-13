ALTER TABLE "Evaluation"
ADD COLUMN "opponentVersionId" TEXT;

CREATE UNIQUE INDEX "PlayerVersion_implementationKey_key"
ON "PlayerVersion"("implementationKey");

CREATE INDEX "Evaluation_opponentVersionId_idx"
ON "Evaluation"("opponentVersionId");

ALTER TABLE "Evaluation"
ADD CONSTRAINT "Evaluation_opponentVersionId_fkey"
FOREIGN KEY ("opponentVersionId") REFERENCES "PlayerVersion"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
