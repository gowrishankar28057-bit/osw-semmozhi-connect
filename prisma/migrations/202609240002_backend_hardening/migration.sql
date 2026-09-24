-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'INFO';

-- CreateIndex
CREATE INDEX "Announcement_workshopId_createdAt_idx" ON "Announcement"("workshopId", "createdAt");

-- CreateIndex
CREATE INDEX "AttendanceRecord_participantId_idx" ON "AttendanceRecord"("participantId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "AuthSession_expiresAt_idx" ON "AuthSession"("expiresAt");

-- CreateIndex
CREATE INDEX "Certificate_workshopId_idx" ON "Certificate"("workshopId");

-- CreateIndex
CREATE INDEX "CommunityMessage_userId_idx" ON "CommunityMessage"("userId");

-- CreateIndex
CREATE INDEX "LearningMaterial_workshopId_createdAt_idx" ON "LearningMaterial"("workshopId", "createdAt");

-- CreateIndex
CREATE INDEX "MeetingPresence_participantId_idx" ON "MeetingPresence"("participantId");

-- CreateIndex
CREATE INDEX "Registration_participantId_status_idx" ON "Registration"("participantId", "status");

-- CreateIndex
CREATE INDEX "Workshop_status_scheduledStart_idx" ON "Workshop"("status", "scheduledStart");

