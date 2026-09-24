export type Role = "ADMIN" | "ORGANIZER" | "PARTICIPANT";
export type User = {
  id: string;
  name: string;
  email: string;
  role: Role;
  department: string;
  enabled: boolean;
};
export type Workshop = {
  id: string;
  title: string;
  description: string;
  speaker: string;
  mode: string;
  location: string;
  scheduledStart: string;
  scheduledEnd: string;
  registrationDeadline: string;
  capacity: number;
  status: string;
  organizerId: string;
  organizer: { id: string; name: string; department: string };
  registrations?: { status: string }[];
  _count: { registrations: number; certificates?: number };
  session?: {
    id: string;
    actualStartedAt: string;
    actualEndedAt: string | null;
  };
};
export type Notice = {
  id: string;
  message: string;
  href: string;
  kind: string;
  readAt: string | null;
  createdAt: string;
};
export type Certificate = {
  id: string;
  certificateNumber: string;
  participantName: string;
  workshopTitle: string;
  speaker: string;
  workshopDate: string;
  attendancePercentage: number;
  issuedAt: string;
};
export type Dashboard = {
  user: User;
  demoMode: boolean;
  presenceMode: string;
  stats: {
    total: number;
    upcoming: number;
    completed: number;
    participants: number;
    certificates: number;
    organizers: number;
    activeOrganizers: number;
    attendance: number | null;
  };
  workshops: Workshop[];
  notifications: Notice[];
  unread: number;
  activity: { id: string; action: string; detail: string; createdAt: string }[];
};
export type AttendanceRow = {
  participant: string;
  participantId: string;
  status: string;
  meetingJoined: boolean;
  inMeeting: boolean;
  presenceSeconds: number;
  qrVerified: boolean;
  verifiedAt: string | null;
  attendancePercentage: number;
  eligible: boolean;
};
export type Attendance = {
  rows: AttendanceRow[];
  completed: boolean;
  actualStartedAt?: string;
  actualEndedAt?: string;
};
export type WindowState = {
  open: boolean;
  expiresAt: string | null;
  url: string | null;
  serverNow: string;
};
export type LiveState = {
  id: string;
  title: string;
  status: string;
  speaker: string;
  organizer: string;
  isOwner: boolean;
  registered: boolean;
  session: { startedAt: string; endedAt: string | null } | null;
  verificationOpen: boolean;
  serverNow: string;
  presenceMode: "browser" | "webhook";
  presenceTracked: boolean;
  provider: "jaas" | "self-hosted" | "public";
  me: {
    recording: boolean;
    presenceSeconds: number;
    attendancePercentage: number;
    qrVerified: boolean;
    verifiedAt: string | null;
    eligible: boolean;
    certificateId: string | null;
  } | null;
  summary: { registered: number; inMeeting: number; verified: number } | null;
  warnings: string[];
};
export type MeetingConfig = {
  provider: string;
  domain: string;
  scriptUrl: string;
  room: string;
  jwt?: string;
  displayName: string;
  moderator: boolean;
  sessionId: string;
  presenceMode: "browser" | "webhook";
};
export type SystemState = {
  appUrl: string | null;
  demoMode: boolean;
  presenceMode: string;
  presenceTracked: boolean;
  jitsi: { provider: string; domain: string };
  jaasWebhook: boolean;
  genericWebhook: boolean;
  warnings: string[];
};
