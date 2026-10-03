-- CreateEnum
CREATE TYPE "ClubStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "DistrictRole" AS ENUM ('RDR', 'SECRETARY');

-- CreateEnum
CREATE TYPE "StaffRole" AS ENUM ('SUPERADMIN', 'SECRETARY');

-- CreateEnum
CREATE TYPE "CartaPoderStatus" AS ENUM ('DRAFT', 'PENDING_SECRETARY', 'SUBMITTED', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "MeetingType" AS ENUM ('ORDINARY', 'EXTRAORDINARY');

-- CreateEnum
CREATE TYPE "ActaStatus" AS ENUM ('DRAFT', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "VotingMethod" AS ENUM ('PUBLIC', 'SECRET');

-- CreateEnum
CREATE TYPE "MajorityType" AS ENUM ('SIMPLE', 'ABSOLUTE', 'TWO_THIRDS', 'THREE_QUARTERS');

-- CreateEnum
CREATE TYPE "BallotType" AS ENUM ('YES_NO', 'CANDIDATE');

-- CreateEnum
CREATE TYPE "MeetingStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'LIVE', 'PAUSED', 'FINISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('INVITED', 'JOINED', 'LEFT');

-- CreateEnum
CREATE TYPE "TopicType" AS ENUM ('DISCUSSION', 'VOTING', 'INFORMATIVE');

-- CreateEnum
CREATE TYPE "TopicStatus" AS ENUM ('PENDING', 'ACTIVE', 'DONE');

-- CreateEnum
CREATE TYPE "VoteSessionStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "VoteChoice" AS ENUM ('YES', 'NO', 'ABSTAIN');

-- CreateEnum
CREATE TYPE "MotionStatus" AS ENUM ('PROPOSED', 'SECONDED', 'VOTING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "SpeakingRequestStatus" AS ENUM ('PENDING', 'ACCEPTED', 'CANCELLED', 'DONE');

-- CreateTable
CREATE TABLE "DirPerson" (
    "id" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "email" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "platformRole" TEXT,
    "externalReference" TEXT,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DirPerson_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DirClub" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "status" "ClubStatus" NOT NULL DEFAULT 'ACTIVE',
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DirClub_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DirMembership" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "title" TEXT,
    "isPresident" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DirMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DirDistrictRole" (
    "personId" TEXT NOT NULL,
    "role" "DistrictRole" NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DirDistrictRole_pkey" PRIMARY KEY ("personId","role")
);

-- CreateTable
CREATE TABLE "DistrictStaff" (
    "personId" TEXT NOT NULL,
    "role" "StaffRole" NOT NULL DEFAULT 'SECRETARY',
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DistrictStaff_pkey" PRIMARY KEY ("personId")
);

-- CreateTable
CREATE TABLE "ClubStanding" (
    "clubId" TEXT NOT NULL,
    "isConstituido" BOOLEAN NOT NULL DEFAULT true,
    "cuotaAldia" BOOLEAN NOT NULL DEFAULT false,
    "informeAlDia" BOOLEAN NOT NULL DEFAULT false,
    "enabledForDistrictMeetings" BOOLEAN NOT NULL DEFAULT true,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClubStanding_pkey" PRIMARY KEY ("clubId")
);

-- CreateTable
CREATE TABLE "DirSyncState" (
    "id" TEXT NOT NULL,
    "lastAttemptAt" TIMESTAMP(3),
    "lastSuccessAt" TIMESTAMP(3),
    "lastError" TEXT,
    "clubs" INTEGER NOT NULL DEFAULT 0,
    "persons" INTEGER NOT NULL DEFAULT 0,
    "memberships" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "DirSyncState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Meeting" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "scheduledAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "status" "MeetingStatus" NOT NULL DEFAULT 'DRAFT',
    "type" "MeetingType" NOT NULL DEFAULT 'ORDINARY',
    "isDistrictMeeting" BOOLEAN NOT NULL DEFAULT true,
    "quorumRequired" INTEGER,
    "quorumMet" BOOLEAN NOT NULL DEFAULT false,
    "isInformationalOnly" BOOLEAN NOT NULL DEFAULT false,
    "attendanceLocked" BOOLEAN NOT NULL DEFAULT false,
    "attendanceLockedAt" TIMESTAMP(3),
    "transcriptionEnabled" BOOLEAN NOT NULL DEFAULT true,
    "currentTopicId" TEXT,
    "createdById" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "currentSpeakerId" TEXT,
    "nextSpeakerId" TEXT,

    CONSTRAINT "Meeting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgendaTopic" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "type" "TopicType" NOT NULL DEFAULT 'DISCUSSION',
    "estimatedDurationSec" INTEGER,
    "status" "TopicStatus" NOT NULL DEFAULT 'PENDING',
    "isAttendanceTopic" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "AgendaTopic_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VoteSession" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "status" "VoteSessionStatus" NOT NULL DEFAULT 'OPEN',
    "votingMethod" "VotingMethod" NOT NULL DEFAULT 'PUBLIC',
    "requiredMajority" "MajorityType" NOT NULL DEFAULT 'SIMPLE',
    "isElection" BOOLEAN NOT NULL DEFAULT false,
    "electionType" TEXT,
    "ballotType" "BallotType" NOT NULL DEFAULT 'YES_NO',
    "round" INTEGER NOT NULL DEFAULT 1,
    "previousSessionId" TEXT,
    "rdrTiebreakerUsed" BOOLEAN NOT NULL DEFAULT false,
    "rdrTiebreakerChoice" "VoteChoice",
    "rdrTiebreakerCandidateId" TEXT,
    "eligibleClubIds" TEXT,
    "eligibleClubCount" INTEGER,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "openedById" TEXT,
    "closedById" TEXT,

    CONSTRAINT "VoteSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VoteCandidate" (
    "id" TEXT NOT NULL,
    "voteSessionId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "userId" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VoteCandidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vote" (
    "id" TEXT NOT NULL,
    "voteSessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "clubId" TEXT,
    "ballotClubId" TEXT,
    "choice" "VoteChoice" NOT NULL,
    "candidateId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Vote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Motion" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "MotionStatus" NOT NULL DEFAULT 'PROPOSED',
    "proposedByUserId" TEXT NOT NULL,
    "proposedByClubId" TEXT NOT NULL,
    "secondedByUserId" TEXT,
    "secondedByClubId" TEXT,
    "voteSessionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Motion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeetingParticipant" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "clubId" TEXT,
    "canVote" BOOLEAN NOT NULL DEFAULT true,
    "isDelegate" BOOLEAN NOT NULL DEFAULT false,
    "attendanceStatus" "AttendanceStatus" NOT NULL DEFAULT 'INVITED',
    "joinedAt" TIMESTAMP(3),

    CONSTRAINT "MeetingParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpeakingRequest" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "SpeakingRequestStatus" NOT NULL DEFAULT 'PENDING',
    "position" INTEGER NOT NULL DEFAULT 0,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedAt" TIMESTAMP(3),

    CONSTRAINT "SpeakingRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimerSession" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "topicId" TEXT,
    "speakingRequestId" TEXT,
    "type" TEXT NOT NULL,
    "plannedDurationSec" INTEGER NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pausedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "overtimeSec" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "TimerSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT,
    "clubId" TEXT,
    "actorUserId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "metadataJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CartaPoder" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "presidentUserId" TEXT NOT NULL,
    "delegateUserId" TEXT NOT NULL,
    "delegateDocNumber" TEXT,
    "delegateDocType" TEXT,
    "status" "CartaPoderStatus" NOT NULL DEFAULT 'DRAFT',
    "secretaryUserId" TEXT,
    "secretarySignedAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "verifiedById" TEXT,
    "documentUrl" TEXT,

    CONSTRAINT "CartaPoder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClubMeetingAttendance" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "attendeeUserId" TEXT NOT NULL,
    "isDelegate" BOOLEAN NOT NULL DEFAULT false,
    "cartaPoderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClubMeetingAttendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SealedVote" (
    "id" TEXT NOT NULL,
    "voteSessionId" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "choice" "VoteChoice" NOT NULL,
    "priorityOrder" INTEGER,
    "documentUrl" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "receivedById" TEXT,

    CONSTRAINT "SealedVote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeetingActa" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "status" "ActaStatus" NOT NULL DEFAULT 'DRAFT',
    "contentJson" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "publishedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MeetingActa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TopicTranscription" (
    "id" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "userId" TEXT,
    "userName" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TopicTranscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attachment" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT,
    "sizeBytes" INTEGER,
    "storageKey" TEXT NOT NULL,
    "storageBackend" TEXT NOT NULL DEFAULT 'fs',
    "uploadedById" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DirPerson_email_idx" ON "DirPerson"("email");

-- CreateIndex
CREATE INDEX "DirClub_code_idx" ON "DirClub"("code");

-- CreateIndex
CREATE INDEX "DirClub_status_idx" ON "DirClub"("status");

-- CreateIndex
CREATE INDEX "DirMembership_clubId_idx" ON "DirMembership"("clubId");

-- CreateIndex
CREATE INDEX "DirMembership_clubId_isPresident_idx" ON "DirMembership"("clubId", "isPresident");

-- CreateIndex
CREATE UNIQUE INDEX "DirMembership_personId_clubId_key" ON "DirMembership"("personId", "clubId");

-- CreateIndex
CREATE INDEX "Meeting_clubId_idx" ON "Meeting"("clubId");

-- CreateIndex
CREATE INDEX "Meeting_status_scheduledAt_idx" ON "Meeting"("status", "scheduledAt");

-- CreateIndex
CREATE INDEX "Meeting_type_idx" ON "Meeting"("type");

-- CreateIndex
CREATE INDEX "AgendaTopic_meetingId_order_idx" ON "AgendaTopic"("meetingId", "order");

-- CreateIndex
CREATE INDEX "VoteSession_meetingId_status_idx" ON "VoteSession"("meetingId", "status");

-- CreateIndex
CREATE INDEX "VoteSession_previousSessionId_idx" ON "VoteSession"("previousSessionId");

-- CreateIndex
CREATE INDEX "VoteCandidate_voteSessionId_idx" ON "VoteCandidate"("voteSessionId");

-- CreateIndex
CREATE INDEX "Vote_voteSessionId_idx" ON "Vote"("voteSessionId");

-- CreateIndex
CREATE INDEX "Vote_voteSessionId_clubId_idx" ON "Vote"("voteSessionId", "clubId");

-- CreateIndex
CREATE INDEX "Vote_candidateId_idx" ON "Vote"("candidateId");

-- CreateIndex
CREATE UNIQUE INDEX "Vote_voteSessionId_userId_key" ON "Vote"("voteSessionId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Vote_voteSessionId_ballotClubId_key" ON "Vote"("voteSessionId", "ballotClubId");

-- CreateIndex
CREATE UNIQUE INDEX "Motion_voteSessionId_key" ON "Motion"("voteSessionId");

-- CreateIndex
CREATE INDEX "Motion_meetingId_idx" ON "Motion"("meetingId");

-- CreateIndex
CREATE INDEX "Motion_status_idx" ON "Motion"("status");

-- CreateIndex
CREATE INDEX "MeetingParticipant_meetingId_idx" ON "MeetingParticipant"("meetingId");

-- CreateIndex
CREATE INDEX "MeetingParticipant_userId_idx" ON "MeetingParticipant"("userId");

-- CreateIndex
CREATE INDEX "MeetingParticipant_meetingId_clubId_idx" ON "MeetingParticipant"("meetingId", "clubId");

-- CreateIndex
CREATE UNIQUE INDEX "MeetingParticipant_meetingId_userId_key" ON "MeetingParticipant"("meetingId", "userId");

-- CreateIndex
CREATE INDEX "SpeakingRequest_meetingId_status_idx" ON "SpeakingRequest"("meetingId", "status");

-- CreateIndex
CREATE INDEX "TimerSession_meetingId_idx" ON "TimerSession"("meetingId");

-- CreateIndex
CREATE INDEX "AuditLog_meetingId_createdAt_idx" ON "AuditLog"("meetingId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_clubId_createdAt_idx" ON "AuditLog"("clubId", "createdAt");

-- CreateIndex
CREATE INDEX "CartaPoder_meetingId_idx" ON "CartaPoder"("meetingId");

-- CreateIndex
CREATE INDEX "CartaPoder_clubId_status_idx" ON "CartaPoder"("clubId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CartaPoder_meetingId_clubId_key" ON "CartaPoder"("meetingId", "clubId");

-- CreateIndex
CREATE INDEX "ClubMeetingAttendance_clubId_idx" ON "ClubMeetingAttendance"("clubId");

-- CreateIndex
CREATE UNIQUE INDEX "ClubMeetingAttendance_meetingId_clubId_key" ON "ClubMeetingAttendance"("meetingId", "clubId");

-- CreateIndex
CREATE INDEX "SealedVote_voteSessionId_idx" ON "SealedVote"("voteSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "SealedVote_voteSessionId_clubId_key" ON "SealedVote"("voteSessionId", "clubId");

-- CreateIndex
CREATE UNIQUE INDEX "MeetingActa_meetingId_key" ON "MeetingActa"("meetingId");

-- CreateIndex
CREATE INDEX "TopicTranscription_topicId_idx" ON "TopicTranscription"("topicId");

-- CreateIndex
CREATE INDEX "Attachment_entityType_entityId_idx" ON "Attachment"("entityType", "entityId");

-- AddForeignKey
ALTER TABLE "DirMembership" ADD CONSTRAINT "DirMembership_personId_fkey" FOREIGN KEY ("personId") REFERENCES "DirPerson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirMembership" ADD CONSTRAINT "DirMembership_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "DirClub"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirDistrictRole" ADD CONSTRAINT "DirDistrictRole_personId_fkey" FOREIGN KEY ("personId") REFERENCES "DirPerson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubStanding" ADD CONSTRAINT "ClubStanding_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "DirClub"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "DirClub"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgendaTopic" ADD CONSTRAINT "AgendaTopic_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoteSession" ADD CONSTRAINT "VoteSession_previousSessionId_fkey" FOREIGN KEY ("previousSessionId") REFERENCES "VoteSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoteSession" ADD CONSTRAINT "VoteSession_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "AgendaTopic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoteSession" ADD CONSTRAINT "VoteSession_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoteCandidate" ADD CONSTRAINT "VoteCandidate_voteSessionId_fkey" FOREIGN KEY ("voteSessionId") REFERENCES "VoteSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vote" ADD CONSTRAINT "Vote_voteSessionId_fkey" FOREIGN KEY ("voteSessionId") REFERENCES "VoteSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vote" ADD CONSTRAINT "Vote_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "VoteCandidate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Motion" ADD CONSTRAINT "Motion_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Motion" ADD CONSTRAINT "Motion_proposedByClubId_fkey" FOREIGN KEY ("proposedByClubId") REFERENCES "DirClub"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Motion" ADD CONSTRAINT "Motion_secondedByClubId_fkey" FOREIGN KEY ("secondedByClubId") REFERENCES "DirClub"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Motion" ADD CONSTRAINT "Motion_voteSessionId_fkey" FOREIGN KEY ("voteSessionId") REFERENCES "VoteSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingParticipant" ADD CONSTRAINT "MeetingParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "DirPerson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingParticipant" ADD CONSTRAINT "MeetingParticipant_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpeakingRequest" ADD CONSTRAINT "SpeakingRequest_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpeakingRequest" ADD CONSTRAINT "SpeakingRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "DirPerson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimerSession" ADD CONSTRAINT "TimerSession_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CartaPoder" ADD CONSTRAINT "CartaPoder_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CartaPoder" ADD CONSTRAINT "CartaPoder_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "DirClub"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubMeetingAttendance" ADD CONSTRAINT "ClubMeetingAttendance_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubMeetingAttendance" ADD CONSTRAINT "ClubMeetingAttendance_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "DirClub"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SealedVote" ADD CONSTRAINT "SealedVote_voteSessionId_fkey" FOREIGN KEY ("voteSessionId") REFERENCES "VoteSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingActa" ADD CONSTRAINT "MeetingActa_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TopicTranscription" ADD CONSTRAINT "TopicTranscription_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "AgendaTopic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TopicTranscription" ADD CONSTRAINT "TopicTranscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "DirPerson"("id") ON DELETE SET NULL ON UPDATE CASCADE;
