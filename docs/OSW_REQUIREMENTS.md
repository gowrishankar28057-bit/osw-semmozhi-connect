# OSW master requirements

User-provided functional specification. Direct user instructions and subsequent scope clarifications take priority.

You are the lead senior full-stack engineer responsible for finishing a
fully functional hackathon MVP.

PROJECT NAME:

OSW – Semmozhi Connect
Workshop & Learning Management Portal

This is a real multi-user application for the Central Institute of
Classical Tamil Track 01 LMS / LLL challenge.

The application will be demonstrated live to a jury using 5 different
devices simultaneously.

THIS MUST BE A WORKING APPLICATION.

Do not create static UI mockups.
Do not hard-code dashboard statistics.
Do not create fake attendance.
Do not create fake certificate eligibility.
Do not leave TODO buttons.
Do not create features that visually exist but do nothing.

Every important button must work end-to-end.

--------------------------------------------------
PRIMARY DEMO
--------------------------------------------------

The final application MUST successfully support this exact live demo.

DEVICE 1 — ADMIN

Admin logs in.

Admin creates a new Organizer:

Name:
Prem

Email:
prem@osw.demo

Department:
Tamil / AI

Temporary Password:
Prem@123

The Organizer account must immediately become usable.

--------------------------------------------------

DEVICE 2 — ORGANIZER

Prem logs in using the account that was just created by the Admin.

Prem creates a workshop:

Title:
Tamil AI – One Day Workshop

Description:
Introduction to AI applications for Tamil language, literature,
preservation and digital heritage.

Speaker:
Prem

Mode:
Online

Prem publishes the workshop.

--------------------------------------------------

DEVICE 3 — PARTICIPANT

A Participant is already logged in.

Without manually refreshing the webpage, the Participant receives:

NEW WORKSHOP

"Prem is conducting Tamil AI – One Day Workshop"

Participant clicks the notification.

Workshop detail page opens.

Participant clicks:

REGISTER

Registration must be stored in the database.

Participant sees:

Registration Confirmed

--------------------------------------------------

DEVICE 2 — ORGANIZER

Prem opens the workshop dashboard.

Prem clicks:

START WORKSHOP

The workshop changes from:

PUBLISHED

to:

ONGOING

The application creates/starts the workshop session.

An embedded video meeting becomes available.

--------------------------------------------------

DEVICE 3 — PARTICIPANT

Participant sees:

JOIN WORKSHOP

Participant clicks it.

A video meeting must open INSIDE the OSW website.

Use Jitsi Meet.

Do NOT build WebRTC/video infrastructure from scratch.

Use the Jitsi External API.

The participant must remain visually inside OSW.

--------------------------------------------------

MEETING ATTENDANCE
--------------------------------------------------

When Participant successfully joins the meeting:

store server timestamp:

joinedAt

When Participant leaves:

store:

leftAt

Support reconnects.

Meeting presence should be stored as segments.

Example:

10:00 joined
10:05 disconnected

10:06 rejoined
10:10 left

Total duration:

9 minutes

Do NOT calculate duration using client-supplied numbers.

Calculate using trusted server timestamps.

--------------------------------------------------
QR ATTENDANCE VERIFICATION
--------------------------------------------------

During an active workshop the Organizer can open:

ATTENDANCE VERIFICATION

Production behavior:

Automatically open attendance verification around the middle of the session.

Hackathon demo behavior:

When DEMO_MODE=true, additionally provide:

TRIGGER DEMO ATTENDANCE CHECK

This button must use exactly the same backend attendance verification
system.

Do not fake attendance.

--------------------------------------------------

When attendance verification starts:

Organizer screen displays a QR code.

Example UI:

ATTENDANCE VERIFICATION

[ QR CODE ]

Expires in

01:59

The QR is valid for exactly:

120 seconds

When 120 seconds expires:

QR #1 becomes invalid.

Generate:

QR #2

QR #2 must use a completely new secure token.

Repeat automatically while attendance verification remains open.

--------------------------------------------------
QR SECURITY
--------------------------------------------------

Generate attendance QR tokens ONLY on the server.

Use:

jose

Sign the token using:

QR_SIGNING_SECRET

The token must contain:

sessionId
challengeId
random nonce
issuedAt
expiresAt

Example QR destination:

/attendance/verify?t=<SIGNED_TOKEN>

Store only necessary challenge information in the database.

Each AttendanceChallenge should contain:

id
sessionId
tokenHash or nonceHash
createdAt
expiresAt
active

Only ONE current rotating challenge should be valid at a time.

When the new QR becomes active:

the old QR must fail.

--------------------------------------------------
DEVICE 4 — QR SCANNER
--------------------------------------------------

Participant scans the QR using a phone.

The phone opens:

OSW Attendance Verification

If not authenticated:

redirect to login

then continue verification after successful login.

DO NOT ask:

Name
Email
Registration Number

The Participant is already authenticated.

Use the authenticated account.

--------------------------------------------------
BACKEND QR VERIFICATION
--------------------------------------------------

The backend must verify all of the following:

1. QR signature is valid
2. token is not expired
3. challenge exists
4. challenge is active
5. challenge belongs to active workshop session
6. workshop is currently ongoing
7. current user is authenticated
8. current user role is PARTICIPANT
9. participant is registered for this workshop
10. participant has not already completed attendance verification
11. token nonce matches current challenge
12. verification is occurring during attendance verification window

If every check passes:

mark:

qrVerified = true

store:

verifiedAt = server timestamp

Display:

✓ ATTENDANCE VERIFIED

Workshop:
Tamil AI – One Day Workshop

Participant:
<participant name>

Verification Time:
<current time>

If QR expired:

display:

ATTENDANCE CODE EXPIRED

Please scan the latest QR displayed by the Organizer.

If QR is reused:

display:

ATTENDANCE ALREADY VERIFIED

--------------------------------------------------
FAKE ATTENDANCE PREVENTION
--------------------------------------------------

QR verification alone must NOT be considered sufficient attendance.

Online attendance requires:

REGISTERED PARTICIPANT
+
MEETING PRESENCE
+
ROTATING QR VERIFICATION

The system must reject QR verification for users who are not registered.

Certificate eligibility must require genuine meeting attendance.

--------------------------------------------------
WORKSHOP END
--------------------------------------------------

Organizer must have:

END WORKSHOP

button.

When Organizer clicks END WORKSHOP:

record the actual session end timestamp.

Workshop/session becomes completed.

For attendance calculations use:

actualSessionStart
actualSessionEnd

This is important for the hackathon demonstration.

Example:

Organizer starts demonstration at:

10:00:00

Organizer ends demonstration at:

10:04:00

Actual workshop runtime:

4 minutes

Participant was present:

3 minutes 50 seconds

Attendance:

230 / 240 × 100

=

95.83%

This is legitimate real attendance for the session that actually ran.

Do NOT hard-code or manually edit attendance percentage.

Scheduled workshop duration can still display:

1 Hour

or:

One Day Workshop

but attendance calculation for an early-ended live demonstration must use
the actual recorded session runtime.

--------------------------------------------------
ATTENDANCE CALCULATION
--------------------------------------------------

Calculate:

totalParticipantPresenceSeconds

/

actualSessionDurationSeconds

*

100

Cap at:

100%

Example:

actual session duration:

240 seconds

participant presence:

230 seconds

attendance:

95.83%

Eligibility rule:

attendancePercentage >= 90

IMPORTANT:

90.00% IS ELIGIBLE.

89.99% IS NOT ELIGIBLE.

Also require:

qrVerified = true

For an online workshop certificate eligibility:

attendancePercentage >= 90
AND
qrVerified = true
AND
registration status = CONFIRMED

--------------------------------------------------
DEVICE 2 — ORGANIZER ATTENDANCE DASHBOARD
--------------------------------------------------

Organizer must see a real-time-ish attendance table.

Columns:

Participant
Registration Status
Meeting Joined
Meeting Duration
QR Verified
Attendance %
Certificate Eligibility

Example:

Arun Kumar
Confirmed
Yes
3m 50s
Verified
95.83%
Eligible

Use polling every approximately 3 seconds for hackathon simplicity.

Do not introduce unnecessary realtime infrastructure.

--------------------------------------------------
CERTIFICATE
--------------------------------------------------

I ALREADY HAVE A CERTIFICATE DESIGN FOR THE DEMO.

First inspect the repository for certificate template assets.

Look for files such as:

public/certificate-template.png
public/certificate-template.jpg
public/certificate-template.pdf
public/assets/certificate/*
assets/certificate/*

If a certificate template exists:

DO NOT redesign it.

Use the existing certificate design as the background/template.

Overlay only dynamic information.

If the certificate template is not found:

create a clean temporary fallback certificate, but clearly structure the
code so I can replace the background asset later without changing the
certificate logic.

--------------------------------------------------
CERTIFICATE CONTENT
--------------------------------------------------

Certificate must dynamically contain:

Participant Name

Workshop Name:
Tamil AI – One Day Workshop

Organizer / Speaker:
Prem

Workshop Date

Attendance Percentage

Certificate ID

Issue Date

Certificate Verification QR

The certificate must be generated only when:

attendancePercentage >= 90
AND
qrVerified = true
AND
workshop status = COMPLETED

--------------------------------------------------
CERTIFICATE VERIFICATION QR
--------------------------------------------------

The QR printed on the certificate is different from the Attendance QR.

Certificate QR should point to:

/certificate/verify/<certificateId>

Anyone, even without login, can open this URL.

Display:

CERTIFICATE VERIFIED

Participant Name
Workshop Name
Workshop Date
Certificate ID
Attendance Percentage
Issued Date

Do not reveal private account information.

If certificate does not exist:

display:

CERTIFICATE NOT FOUND

--------------------------------------------------
CERTIFICATE DOWNLOAD
--------------------------------------------------

Participant dashboard must show:

MY CERTIFICATES

When eligible and generated:

Tamil AI – One Day Workshop

Attendance:
95.83%

Status:
Certificate Issued

Buttons:

VIEW CERTIFICATE

DOWNLOAD PDF

VERIFY CERTIFICATE

PDF download must work on desktop and mobile.

--------------------------------------------------
DEVICE 5 — CERTIFICATE VERIFICATION
--------------------------------------------------

Use Device 5 during jury presentation.

Open certificate QR.

Show public verification webpage.

This demonstrates that certificates cannot simply be visually copied.

--------------------------------------------------
PLATFORM ROLES
--------------------------------------------------

There are exactly three platform roles:

ADMIN
ORGANIZER
PARTICIPANT

--------------------------------------------------
ADMIN
--------------------------------------------------

Admin can:

View dashboard
Create Organizer
Edit Organizer
Disable Organizer
Enable Organizer
View Organizers
Monitor workshops
View participant count
View certificate count
View system activity

Only Admin can create Organizer accounts.

Organizer cannot self-register.

--------------------------------------------------
ORGANIZER
--------------------------------------------------

Organizer can:

Create Workshop
Edit Workshop
Publish Workshop
Start Workshop
End Workshop
View registrations
View participants
Open online meeting
Trigger attendance verification
View rotating QR
View attendance
Create announcements
View certificates
View reports

Organizer can modify ONLY their own workshops.

--------------------------------------------------
PARTICIPANT
--------------------------------------------------

Participant can:

Create participant account
Login
View workshops
Search workshops
View workshop details
Register
Cancel registration before workshop begins
Join meeting
Receive notifications
Check attendance
Access learning materials
Join community/group
View certificates
Download certificates
Verify certificates

--------------------------------------------------
WORKSHOP DISCOVERY
--------------------------------------------------

Create:

/workshops

Show published workshops.

Support:

search by title
filter by upcoming/ongoing/completed
workshop detail page

Each workshop card should display:

title
organizer
date
time
mode
registration status
capacity

--------------------------------------------------
NOTIFICATIONS
--------------------------------------------------

Create database-backed notification system.

Important notifications:

Organizer publishes workshop:

"Prem is conducting Tamil AI – One Day Workshop"

Participant registers:

"Registration confirmed for Tamil AI – One Day Workshop"

Workshop begins:

"Tamil AI – One Day Workshop has started"

Attendance verification:

"Attendance verification is now open"

Certificate created:

"Your certificate for Tamil AI – One Day Workshop is ready"

Use polling approximately every 3–5 seconds.

Notification bell must display unread count.

Allow:

mark as read

--------------------------------------------------
ANNOUNCEMENTS
--------------------------------------------------

Organizer can post an announcement to workshop participants.

Example:

"Attendance verification will begin shortly."

All registered participants receive it.

--------------------------------------------------
COMMUNITY
--------------------------------------------------

Implement a simple workshop community.

Each workshop can have one discussion/community page.

Registered participants and the Organizer can:

post message
view messages

Do not build a complex social platform.

Simple database-backed messages are sufficient.

--------------------------------------------------
AUTHENTICATION
--------------------------------------------------

Use:

Auth.js / NextAuth

or a secure equivalent appropriate to the existing repository.

Passwords:

bcrypt

Sessions:

secure HTTP-only cookies

Role authorization must be enforced SERVER SIDE.

Never rely only on hidden menu items.

If Participant manually visits:

/admin

return unauthorized / redirect.

If Organizer visits another organizer's workshop editing URL:

deny access.

--------------------------------------------------
TECHNOLOGY
--------------------------------------------------

Preferred stack:

Next.js App Router
TypeScript
Tailwind CSS
shadcn/ui
Neon PostgreSQL
Prisma ORM
Auth.js / NextAuth
bcrypt
Zod
Jitsi Meet External API
qrcode
jose
pdf-lib or equivalent

Deployment:

Vercel

Database:

Neon PostgreSQL

--------------------------------------------------
DATABASE
--------------------------------------------------

Create or update Prisma models for:

User

Workshop

WorkshopSession

Registration

MeetingPresence

AttendanceChallenge

AttendanceRecord

Notification

Announcement

CommunityMessage

Certificate

AuditLog

--------------------------------------------------
USER
--------------------------------------------------

Fields approximately:

id
name
email
passwordHash
role
department
enabled
createdAt
updatedAt

Enum:

ADMIN
ORGANIZER
PARTICIPANT

--------------------------------------------------
WORKSHOP
--------------------------------------------------

Fields approximately:

id
title
description
organizerId
speaker
mode
location
scheduledStart
scheduledEnd
registrationDeadline
capacity
status
meetingRoom
createdAt
updatedAt

Statuses:

DRAFT
PUBLISHED
ONGOING
COMPLETED
CANCELLED

--------------------------------------------------
WORKSHOP SESSION
--------------------------------------------------

Fields:

id
workshopId
actualStartedAt
actualEndedAt
attendanceVerificationOpenedAt
attendanceVerificationClosedAt

--------------------------------------------------
REGISTRATION
--------------------------------------------------

Fields:

id
workshopId
participantId
status
registeredAt
cancelledAt

Prevent duplicates using database unique constraint.

--------------------------------------------------
MEETING PRESENCE
--------------------------------------------------

Fields:

id
sessionId
participantId
joinedAt
leftAt

Allow multiple rows due to reconnects.

--------------------------------------------------
ATTENDANCE RECORD
--------------------------------------------------

Fields:

id
sessionId
participantId
qrVerified
verifiedAt
presenceSeconds
attendancePercentage
eligible

Use unique constraint:

sessionId + participantId

--------------------------------------------------
CERTIFICATE
--------------------------------------------------

Fields:

id
certificateNumber
participantId
workshopId
attendancePercentage
issuedAt
verificationToken or public certificate ID
pdfPath or generation metadata

Certificate ID must be unique.

--------------------------------------------------
AUDIT LOG
--------------------------------------------------

Record important actions:

Admin creates Organizer
Organizer creates Workshop
Workshop published
Participant registered
Workshop started
Attendance verification opened
Participant attendance verified
Workshop ended
Certificate issued

This gives the Admin useful monitoring information.

--------------------------------------------------
DASHBOARD UI
--------------------------------------------------

Use the existing OSW / Semmozhi Connect design language from the repository.

ADMIN:

white
maroon
gold
heritage inspired

ORGANIZER:

dark blue sidebar
white cards
gold accents

PARTICIPANT:

dark blue sidebar
clean cards
attendance progress
certificate section
Tamil heritage imagery where assets already exist

Keep UI professional.

Do not overwhelm with text.

Must be responsive on:

desktop
laptop
tablet
mobile

--------------------------------------------------
DEMO ACCOUNTS
--------------------------------------------------

Seed only:

ADMIN

admin@osw.demo
Admin@123

PARTICIPANT

participant@osw.demo
Participant@123

DO NOT seed Prem.

Prem must be created LIVE by the Admin during jury demonstration.

--------------------------------------------------
DEMO MODE
--------------------------------------------------

Environment variable:

DEMO_MODE=true

Demo mode may expose:

Trigger Demo Attendance Check

It must NOT:

automatically give attendance
automatically give certificate
bypass QR validation
bypass meeting participation
change 90% requirement

All real eligibility rules remain active.

--------------------------------------------------
DEMO RESET
--------------------------------------------------

Because this is a hackathon demo, create an ADMIN-only:

RESET DEMO DATA

feature available only when:

DEMO_MODE=true

Require confirmation:

RESET

It should remove:

Prem demo organizer
demo workshops
demo registrations
meeting attendance
QR challenges
notifications
demo certificates

It must preserve:

seeded Admin
seeded Participant

This lets the team repeat the demonstration if something goes wrong.

Protect this route SERVER SIDE.

Never expose it in production when DEMO_MODE=false.

--------------------------------------------------
ENVIRONMENT VARIABLES
--------------------------------------------------

Create:

.env.example

Include:

DATABASE_URL=
AUTH_SECRET=
QR_SIGNING_SECRET=
NEXT_PUBLIC_APP_URL=
DEMO_MODE=false

If required by Jitsi integration include appropriate variables.

Never expose private secrets in NEXT_PUBLIC variables.

--------------------------------------------------
ERROR HANDLING
--------------------------------------------------

Handle:

duplicate organizer email
duplicate registration
expired QR
invalid QR
already-used QR
unauthorized access
disabled organizer
workshop full
registration closed
meeting not started
workshop already completed
certificate not eligible
database failure

Show useful user-facing errors.

Do not expose stack traces.

--------------------------------------------------
LOADING STATES
--------------------------------------------------

Important actions need visible feedback.

Examples:

Creating Organizer...
Publishing Workshop...
Registering...
Joining Workshop...
Verifying Attendance...
Generating Certificate...

Prevent accidental double submissions.

--------------------------------------------------
TEST THESE SECURITY CASES
--------------------------------------------------

1.

Participant manually calls Admin organizer creation endpoint.

Expected:

403

2.

Organizer tries to edit another Organizer's workshop.

Expected:

403

3.

Participant scans expired QR.

Expected:

Rejected

4.

Participant sends screenshot of previous QR after rotation.

Expected:

Rejected

5.

Unregistered Participant scans active QR.

Expected:

Rejected

6.

Participant scans QR twice.

Expected:

Second attempt rejected/already verified

7.

Participant has QR verification but insufficient meeting attendance.

Expected:

No certificate

8.

Participant has 90.00% attendance.

Expected:

Certificate eligible

9.

Participant has 89.99% attendance.

Expected:

Not eligible

--------------------------------------------------
FINAL LIVE DEMO ACCEPTANCE TEST
--------------------------------------------------

DO NOT consider this application complete until this test succeeds.

DEVICE 1:

login Admin

↓

create Prem

↓

success


DEVICE 2:

login Prem

↓

create Tamil AI – One Day Workshop

↓

publish

↓

success


DEVICE 3:

participant notification appears

↓

participant registers

↓

success


DEVICE 2:

Prem starts workshop

↓

meeting created

↓

success


DEVICE 3:

participant joins embedded meeting

↓

meeting presence starts recording

↓

success


DEVICE 2:

trigger attendance verification

↓

QR displayed with 120 second timer

↓

success


DEVICE 4:

scan QR

↓

authentication checked

↓

registration checked

↓

token checked

↓

attendance verified

↓

success


DEVICE 2:

attendance dashboard shows verification

↓

end workshop after enough real participant presence

↓

attendance percentage calculated

↓

success


SYSTEM:

if percentage >= 90

generate certificate using existing certificate design

↓

success


DEVICE 3:

certificate appears

↓

PDF downloads

↓

success


DEVICE 5:

scan certificate verification QR

↓

public certificate verification succeeds

↓

success

--------------------------------------------------
DEPLOYMENT
--------------------------------------------------

Application must work from multiple physical devices over the internet.

Deploy using:

Vercel

Database:

Neon PostgreSQL

Do NOT depend on localhost after deployment.

NEXT_PUBLIC_APP_URL must use production URL.

Attendance QR must contain the production URL so phones can open it.

Jitsi must work over HTTPS.

--------------------------------------------------
BUILD QUALITY
--------------------------------------------------

Before finishing:

run database migrations

run seed

run TypeScript checks

run lint

run npm run build

Fix every error.

Then run the application and manually test the core flow.

Search for:

TODO
FIXME
placeholder
mock
hardcoded attendance
hardcoded certificate

Remove incomplete production-flow implementations.

Do NOT claim something works without checking the corresponding code path.

--------------------------------------------------
WORKING METHOD
--------------------------------------------------

First inspect the existing repository.

Do NOT unnecessarily replace working UI or working features.

Reuse existing OSW design and components where practical.

Then write:

IMPLEMENTATION_PLAN.md

Break implementation into phases.

Then implement in this order:

PHASE 1
Database + Prisma

PHASE 2
Authentication + authorization

PHASE 3
Admin + Organizer creation

PHASE 4
Organizer workshop CRUD

PHASE 5
Participant discovery + registration

PHASE 6
Notifications

PHASE 7
Jitsi embedded meeting

PHASE 8
Meeting presence tracking

PHASE 9
Rotating signed QR attendance

PHASE 10
Attendance calculation

PHASE 11
Certificate generation using existing template

PHASE 12
Certificate verification QR

PHASE 13
Community + announcements

PHASE 14
Demo reset system

PHASE 15
UI polish

PHASE 16
Production deployment preparation

After EACH phase:

run relevant tests
run TypeScript check
fix errors

Do not wait for me to approve every individual file.

Continue implementing until the complete acceptance flow works.

If the existing repository uses a slightly different but suitable technology,
adapt intelligently rather than rewriting the entire project.

Priority is:

WORKING DEMO
SECURITY
RELIABILITY
MULTI-DEVICE FUNCTIONALITY
THEN VISUAL POLISH.

START NOW:

1. Inspect the entire repository.
2. Identify current architecture.
3. Locate certificate design assets.
4. Locate existing OSW UI assets.
5. Inspect package.json.
6. Inspect database/auth configuration.
7. Create IMPLEMENTATION_PLAN.md.
8. Begin implementation.
9. Continue until the acceptance flow is working.
10. Run production build and fix all errors.
