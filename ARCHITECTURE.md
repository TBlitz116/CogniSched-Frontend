# CogniSched — AI-Driven Cognitive Load Optimized Meeting Coordination System

## Overview

CogniSched is a three-tier meeting coordination system designed for academic environments. It enables students to request meetings with Teaching Assistants (TAs), while an AI-powered cognitive load engine ensures optimal scheduling that prevents TA burnout. Professors oversee the process with calendar management and approval workflows.

The system follows a strict **three-role hierarchy**: Professor → TA → Student, where each role has distinct capabilities and visibility.

---

## System Architecture

### Technology Stack

| Layer | Technology | Deployment |
|-------|-----------|------------|
| Frontend | React 18 + TypeScript + Tailwind CSS + Vite | Vercel |
| Backend | FastAPI + SQLAlchemy + PostgreSQL | Render |
| AI Agent Layer | Python + Google Gemini 2.0 Flash | Embedded in backend |
| Faculty Scraper | Go + goquery | Standalone CLI tool |
| Database | PostgreSQL 15 | Render |

### External Services

| Service | Purpose |
|---------|---------|
| Google OAuth 2.0 | User authentication |
| Google Calendar API | Event creation, busy/free slots, Meet link generation |
| Google Gemini API | Natural language classification and parsing |
| SendGrid | Invite email delivery |
| UMBC Faculty Website | Professor identity verification (scraped) |

---

## Frontend Architecture

The frontend is a single-page React application with client-side routing and role-based access control.

### Entry Flow

1. **`main.tsx`** — Bootstraps the app with `GoogleOAuthProvider` and `BrowserRouter`
2. **`App.tsx`** — Defines 5 routes: `/login`, `/join`, `/student`, `/ta`, `/professor`
3. **`ProtectedRoute.tsx`** — Guards routes by checking JWT token and matching user role. Redirects unauthorized users to `/login`

### API Communication

- **`api.ts`** — Axios instance configured with `VITE_API_BASE_URL` environment variable
- Automatically attaches `Authorization: Bearer {token}` to every request via a request interceptor
- Tokens stored in `localStorage` via `auth.ts` helper functions

### Authentication Flow

```
User clicks "Sign in with Google"
  → Google OAuth popup (calendar scope included)
  → Auth code returned to frontend
  → POST /auth/google { code, redirect_uri, invite_token? }
  → Backend exchanges code for tokens, creates/updates user
  → Returns { access_token (JWT), role }
  → Frontend stores token + role in localStorage
  → Redirects to role-specific dashboard
```

### Role-Based Dashboards

#### Professor Dashboard (`ProfessorDashboard.tsx`)

**Two tabs: Calendar | Team Overview**

- **Calendar Tab**:
  - Combined view showing Google Calendar events (blue), manually created blocks (orange), and booked student meetings (green)
  - Natural language block scheduling: professor types "Block Tuesday 2–4pm for grading" → Gemini parses to datetime ranges → preview → confirm → synced to Google Calendar
  - Data sources: `GET /professor/calendar` + `GET /professor/google-calendar`

- **Team Overview Tab**:
  - Lists all TAs with cognitive score, burnout risk, and student count
  - Data source: `GET /professor/team`

- **Notification Bell** (header):
  - Shows count of pending approvals from TAs booking "soonest" slots
  - Dropdown displays: student name, time, reason, TA name
  - Accept/Reject buttons for each pending approval
  - Data sources: `GET /professor/pending-approvals`, `POST /professor/approve/{id}`, `POST /professor/reject/{id}`

- **TA Invite** (header):
  - Email input field to send invite emails via SendGrid
  - Data source: `POST /auth/invite { email }`

#### TA Dashboard (`TADashboard.tsx`)

**Three tabs: Requests | Calendar | Analytics**

- **Requests Tab** (split panel):
  - Left panel: Pending student requests sorted by priority (P1 first)
  - Right panel (when request selected):
    - Request details with priority badge and topic label
    - **"Schedule with AI"** prompt input: TA types natural language like "tomorrow afternoon" or "find a light slot this week" → Gemini interprets → returns filtered slot suggestions
    - **Recommended tab** (default): Top 3 slots ranked by cognitive impact score. Booking is instant — creates Google Calendar event with Meet link for all three parties
    - **Soonest tab**: Top 3 earliest available slots. Booking creates a pending approval for the professor. Shows amber warning about approval requirement
    - Each slot card shows: time, cognitive impact score, deep work safety, back-to-back detection, burnout risk assessment
  - Rejected bookings banner: Appears when professor rejects a soonest booking, prompting TA to rebook

- **Calendar Tab**:
  - TA's booked meetings with student details and Meet links
  - Professor's blocked times (from DB)
  - Professor's Google Calendar busy times (opaque — no event details, just start/end times for privacy)
  - Data source: `GET /ta/calendar`

- **Analytics Tab**:
  - 7-day cognitive load score trend (line chart via Recharts)
  - Meeting density by hour 9am–5pm (bar chart)
  - Current burnout risk badge (LOW/MEDIUM/HIGH)
  - Data sources: `GET /analytics/cognitive`, `GET /analytics/burnout`, `GET /analytics/density`

- **Student Invite** (header): Email input to invite students

#### Student Dashboard (`StudentDashboard.tsx`)

- **Request Form**: Natural language input (e.g., "I need help understanding my midterm grade")
  - Submits to `POST /requests/new`
  - Backend classifies via Gemini: priority (P1–P4), topic, time hint
  - Displays AI classification result after submission

- **Request History**: All submitted requests with status badges
  - PENDING → waiting for TA
  - AWAITING_APPROVAL → TA booked soonest slot, waiting for professor
  - SCHEDULED → confirmed, check Google Calendar for Meet link
  - DECLINED → TA declined the request

### Shared Components

- **`WeeklyCalendar.tsx`**: 7-day calendar view (Mon–Sun, 7am–9pm) with color-coded events. Supports navigation between weeks and clickable Meet links
- **`PriorityBadge.tsx`**: Visual indicator for P1 (red) through P4 (gray)
- **`BurnoutBadge.tsx`**: Color-coded burnout risk: LOW (green), MEDIUM (yellow), HIGH (red)

---

## Backend Architecture

The backend is a FastAPI application with SQLAlchemy ORM, organized into models, routes, and services.

### Application Startup (`main.py`)

1. Configures CORS middleware allowing frontend origins (localhost + production URL)
2. Registers route prefixes: `/auth`, `/users`, `/mappings`, `/professor`, `/requests`, `/ta`, `/analytics`
3. Auto-creates all database tables via `Base.metadata.create_all()`
4. Exposes `/health` endpoint for Render health checks

### Authentication & Authorization

- **JWT tokens** with 7-day expiration (HS256 algorithm)
- `get_current_user` dependency: Extracts Bearer token → decodes JWT → fetches User from DB
- `require_role(*roles)` factory: Returns a dependency that ensures the user has the required role
- Google OAuth code exchange with `google-auth` library, stores `refresh_token` for Calendar API access

### Database Schema

```
users
├── id, email (unique), name, role (PROFESSOR|TA|STUDENT)
├── timezone, google_refresh_token, created_at

meeting_requests
├── id, student_id → users, ta_id → users
├── prompt_text, detected_priority (P1-P4), detected_topic
├── preferred_time_range, status (PENDING|AWAITING_APPROVAL|SCHEDULED|DECLINED)
├── created_at

booked_meetings
├── id, request_id → meeting_requests
├── student_id → users, ta_id → users, professor_id → users
├── start_time, end_time, google_event_id, google_meet_link
├── cognitive_score_impact, created_at

calendar_blocks
├── id, professor_id → users
├── title, start_time, end_time, source_prompt
├── is_available (bool), google_event_id, created_at

cognitive_scores
├── id, ta_id → users, date, score (0-100)
├── burnout_risk (LOW|MEDIUM|HIGH)
├── meeting_count, total_gap_minutes, created_at

role_mappings
├── id, student_id → users (nullable), ta_id → users, professor_id → users

pending_invites
├── id, token (UUID), inviter_id → users
├── role_to_assign, used (bool), expires_at, created_at

pending_approvals
├── id, request_id → meeting_requests
├── ta_id → users, professor_id → users, student_id → users
├── start_time, end_time, reason, status (PENDING|ACCEPTED|REJECTED)
├── created_at, resolved_at

verified_faculty
├── id, name, email (unique), title, department, scraped_at
```

### API Routes

#### Authentication (`/auth`)
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/auth/google` | POST | Exchange Google OAuth code for JWT. Creates user if new. Handles invite tokens for role assignment |
| `/auth/invite` | POST | Create invite and send email via SendGrid. Professor invites TA, TA invites Student |

#### Professor (`/professor`)
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/professor/block/preview` | POST | Parse natural language into calendar block previews via Gemini |
| `/professor/block/confirm` | POST | Save blocks to DB + sync to Google Calendar |
| `/professor/calendar` | GET | Return professor's blocks and booked meetings |
| `/professor/google-calendar` | GET | Fetch upcoming Google Calendar events |
| `/professor/team` | GET | List TAs with cognitive scores, burnout risk, student counts |
| `/professor/pending-approvals` | GET | List soonest bookings awaiting approval |
| `/professor/approve/{id}` | POST | Approve booking → create meeting + Calendar event + recompute cognitive score |
| `/professor/reject/{id}` | POST | Reject booking → set request back to PENDING for TA to rebook |

#### TA (`/ta`)
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/ta/notifications` | GET | Pending meeting requests sorted by priority |
| `/ta/suggestions/{id}` | GET | Top 3 recommended slots (cognitive-optimized) |
| `/ta/soonest/{id}` | GET | Top 3 earliest available slots |
| `/ta/suggest-by-prompt` | POST | AI-powered slot search from TA's natural language prompt |
| `/ta/book` | POST | Book recommended slot → Calendar event + cognitive recompute |
| `/ta/book-soonest` | POST | Book soonest slot → create pending approval for professor |
| `/ta/calendar` | GET | TA's meetings + professor blocks + professor's Google Calendar busy times |
| `/ta/rejected-bookings` | GET | Soonest bookings rejected by professor |
| `/ta/decline/{id}` | POST | Decline a student's meeting request |

#### Student (`/requests`)
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/requests/new` | POST | Submit meeting request with natural language prompt → Gemini classifies |
| `/requests/mine` | GET | Student's request history with statuses |

#### Analytics (`/analytics`)
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/analytics/cognitive` | GET | 7-day cognitive score history for TA |
| `/analytics/burnout` | GET | 30-day burnout trend with risk assessment |
| `/analytics/density` | GET | Meeting density by hour (9am–5pm) over 7 days |

### Services

#### Calendar Service (`calendar_service.py`)
- Builds Google Calendar API client from stored refresh tokens
- Creates meetings with Google Meet video conferencing, 3-party invites, and email reminders
- Creates opaque busy blocks on professor's calendar
- Fetches upcoming events and free/busy data
- Privacy-safe: `get_busy_slots()` uses FreeBusy API — returns only start/end times, no event details

#### Cognitive Service (`cognitive_service.py`)
- Computes daily cognitive load scores using the cognitive engine
- Maintains 7-day rolling burnout risk assessment
- Scores candidate time slots to predict cognitive impact of adding a meeting
- Persists scores in the `cognitive_scores` table

#### Slot Service (`slot_service.py`)
- **`generate_suggestions()`**: Finds 3 best slots within priority-based time window
  - Business hours only (9am–5pm, Mon–Fri)
  - Avoids conflicts with TA meetings and professor blocks
  - Ranks by cognitive impact score (lower = better)
- **`generate_soonest_suggestions()`**: Finds 3 earliest available slots (chronological)
- **`generate_prompt_suggestions()`**: AI-powered scheduling
  - Sends full context to Gemini (meetings, blocks, cognitive state)
  - Gemini interprets TA's natural language preferences
  - Filters candidates by interpreted preferences (dates, time range, back-to-back avoidance, deep work protection)

#### Email Service (`email_service.py`)
- Sends invite emails via SendGrid REST API
- HTML template with branded "Accept Invitation" button
- 7-day expiration notice

---

## AI Agent Layer

Four Python modules provide the intelligence layer, embedded directly in the backend.

### Priority Parser (`priority_parser.py`)

**Purpose**: Classify student meeting requests

- **Primary**: Gemini 2.0 Flash with structured JSON output
- **Fallback**: Keyword-based classification if Gemini fails
- **Input**: Student's natural language prompt
- **Output**:
  - `priority` (1–4): P1=recommendation letters, P2=exam questions, P3=exam reflection, P4=general
  - `topic`: RECOMMENDATION | EXAM_QUESTION | EXAM_REFLECTION | GENERAL
  - `extracted_time_hint`: Any time preference mentioned (e.g., "next week")
  - `summary`: One-sentence summary

### Cognitive Engine (`cognitive_engine.py`)

**Purpose**: Deterministic cognitive load scoring algorithm

- **`compute_daily_score(meetings)`** → Score 0–100:
  - Meeting count × 10 points
  - Back-to-back pairs × 15 points (gap < 15 minutes)
  - Context switches × 8 points
  - Deep work violations × 20 points (meetings during 9–11am)
  - Bonus: total inter-meeting gap minutes ÷ 5

- **`compute_burnout_risk(daily_scores)`** → LOW | MEDIUM | HIGH:
  - 7-day rolling average: < 40 = LOW, 40–65 = MEDIUM, > 65 = HIGH

- **`score_slot(candidate, existing, priority, current_score)`** → Slot ranking:
  - Cognitive delta (impact of adding this meeting)
  - Back-to-back penalty (+15 if creates consecutive meetings)
  - Deep work penalty (+20 if during 9–11am)
  - Density penalty (+10 if day already has 3+ meetings)
  - Urgency bonus: P1 reduces score by 20, P2 by 15, P3 by 5
  - Lower score = better slot

### Slot Prompt Agent (`slot_prompt_agent.py`)

**Purpose**: Interpret TA's natural language scheduling prompts

- **Input**: TA's prompt + full context (existing meetings, professor blocks, professor's Google Calendar busy times, cognitive score, burnout risk)
- **Output**: Structured scheduling preferences
  - `preferred_dates`, `preferred_start_hour`, `preferred_end_hour`
  - `avoid_back_to_back`, `protect_deep_work`
  - `duration_minutes`, `reasoning`
- **Examples**:
  - "tomorrow afternoon" → next day, 12–5pm
  - "light day this week" → protect deep work, avoid back-to-back
  - If burnout risk is HIGH → auto-enables deep work protection

### Professor Block Agent (`professor_block_agent.py`)

**Purpose**: Parse professor's natural language into calendar blocks

- **Input**: Professor's prompt + current date + timezone
- **Output**: List of `{ title, start (ISO 8601), end (ISO 8601) }`
- **Example**: "I'm busy Tuesday 2–4pm and Wednesday morning" → two calendar blocks

---

## Faculty Scraper (Go)

A standalone Go CLI tool that populates the `verified_faculty` table for automatic professor verification during registration.

### Pipeline

1. **Scrape faculty names**: Fetches UMBC CSEE tenure-track and instructional faculty pages using `goquery`. Extracts names and titles from HTML, deduplicates by name
2. **Look up emails**: For each faculty member, queries the UMBC directory (`www2.umbc.edu/search/directory/`). Extracts email from `mailto:` links. Rate-limited to 500ms between requests
3. **Store in database**: Connects to PostgreSQL, creates `verified_faculty` table if needed, clears old data, inserts faculty with emails (upserts on conflict)

### Usage
```bash
cd scraper-go
go run main.go
```

Reads `DATABASE_URL` from the backend's `.env` file.

---

## Key Data Flows

### 1. Student Meeting Request

```
Student enters prompt (e.g., "I need help with my midterm grade")
  → POST /requests/new
  → priority_parser: Gemini classifies → P3, EXAM_REFLECTION
  → MeetingRequest created (status: PENDING, ta_id from role_mappings)
  → TA sees in notifications (sorted P1 first)
```

### 2. TA Books Recommended Slot

```
TA selects request → GET /ta/suggestions/{id}
  → slot_service generates 30-min candidates (business hours, weekdays)
  → Filters: no TA conflicts, no professor blocks
  → cognitive_engine scores each candidate
  → Returns top 3 (lowest score = best)
TA clicks "Confirm" → POST /ta/book
  → Google Calendar event created (TA + student + professor)
  → Also created on professor's calendar
  → BookedMeeting saved, cognitive score recomputed
  → MeetingRequest status → SCHEDULED
```

### 3. TA Books Soonest Slot (Requires Approval)

```
TA switches to "Soonest" tab → GET /ta/soonest/{id}
  → Returns 3 earliest chronological slots
TA clicks "Request Approval" → POST /ta/book-soonest
  → PendingApproval created (status: PENDING)
  → MeetingRequest status → AWAITING_APPROVAL
Professor sees bell notification → GET /professor/pending-approvals
  → Clicks "Accept" → POST /professor/approve/{id}
    → BookedMeeting created + Calendar event + cognitive recompute
  → Clicks "Reject" → POST /professor/reject/{id}
    → MeetingRequest back to PENDING, TA sees in rejected bookings
```

### 4. AI-Powered Scheduling

```
TA types "find a light slot after lunch this week"
  → POST /ta/suggest-by-prompt { request_id, prompt }
  → slot_prompt_agent: Gemini interprets prompt + context
    → preferred_dates: remaining weekdays
    → preferred_start_hour: 13, protect_deep_work: true
  → slot_service filters candidates by preferences
  → cognitive_engine scores remaining candidates
  → Returns top 3 with AI reasoning
```

### 5. Professor Calendar Blocking

```
Professor types "Block Thursday 9am to 5pm for conference"
  → POST /professor/block/preview { prompt, timezone }
  → professor_block_agent: Gemini parses → { title, start, end }
  → Professor reviews preview → POST /professor/block/confirm
  → CalendarBlock saved + synced to Google Calendar
  → Block visible to TAs (excluded from slot generation)
```

### 6. Invite Chain

```
Professor enters TA email → POST /auth/invite { email }
  → PendingInvite created (role: TA, expires: 7 days)
  → SendGrid email sent with invite link
  → TA clicks link → /join?token=xxx → Google OAuth
  → POST /auth/google { code, invite_token }
  → User created (role: TA), RoleMapping created (professor → TA)

TA enters student email → same flow
  → User created (role: STUDENT), RoleMapping created (professor → TA → student)
```

---

## Cognitive Load Model

The cognitive load engine is the core differentiator of CogniSched. It prevents TA burnout by quantifying the mental cost of scheduling decisions.

### Daily Score (0–100)

| Factor | Points | Description |
|--------|--------|-------------|
| Meeting count | ×10 | Each meeting adds base cognitive load |
| Back-to-back pairs | ×15 | Meetings within 15 minutes of each other |
| Context switches | ×8 | Transitions between different activities |
| Deep work violations | ×20 | Meetings during protected 9–11am window |
| Gap bonus | ÷5 | Total minutes of buffer between meetings (reduces load) |

### Burnout Risk (7-Day Rolling Average)

| Average Score | Risk Level |
|---------------|------------|
| < 40 | LOW (green) |
| 40–65 | MEDIUM (yellow) |
| > 65 | HIGH (red) |

### Slot Ranking

Each candidate slot is scored by simulating its cognitive impact:
- **Cognitive delta**: Difference in daily score with/without this meeting
- **Penalties**: Back-to-back (+15), deep work violation (+20), high density (+10)
- **Urgency bonus**: P1 (-20), P2 (-15), P3 (-5), P4 (0)
- **Lower score = better slot** — the algorithm prefers slots that minimize cognitive disruption

---

## Security & Privacy

- **JWT authentication** on all API endpoints
- **Role-based access control**: Users can only access their designated dashboard and data
- **Google refresh tokens** stored in database for Calendar API access
- **Professor's Google Calendar**: TAs see only busy/free times (via FreeBusy API), not event details
- **Invite-only registration**: Only professors can self-register (verified against faculty list); TAs and students require invite links
- **CORS**: Restricted to frontend origin only
- **SendGrid**: Verified sender identity for email delivery

---

## Deployment

| Component | Platform | URL |
|-----------|----------|-----|
| Frontend | Vercel | `https://cogni-sched-frontend.vercel.app` |
| Backend | Render (Web Service) | `https://cognisched-backend.onrender.com` |
| Database | Render (PostgreSQL) | Internal connection |

### Environment Variables

**Backend (Render)**:
- `DATABASE_URL` — PostgreSQL connection string
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` — Google OAuth credentials
- `GOOGLE_REDIRECT_URI` — Frontend production URL
- `JWT_SECRET` — JWT signing key
- `GEMINI_API_KEY` — Google Gemini API key
- `SENDGRID_API_KEY`, `SENDGRID_FROM_EMAIL` — Email delivery
- `FRONTEND_URL` — CORS origin and redirect URL

**Frontend (Vercel)**:
- `VITE_API_BASE_URL` — Backend production URL
- `VITE_GOOGLE_CLIENT_ID` — Google OAuth client ID
