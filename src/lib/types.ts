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
