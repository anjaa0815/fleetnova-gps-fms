# FLEETNOVA — Smart Fleet Management System

**FLEETNOVA** is an enterprise-grade, centralized commercial fleet management web application built on the **MERN** stack (MongoDB, Express.js, React.js, Node.js) with intelligent AI operations telemetry powered by **Google Gemini API**.

---

## 🚀 Key Highlights & Architectural Strengths

- **Zero-Trust Role-Based Access Control (RBAC):** Admin, Fleet Manager, and Commercial Driver roles strictly enforced on both client and Express REST endpoints.
- **Strict Fleet Business Rules:** Prevents assignment of unavailable rigs, vehicles under active maintenance, or drivers currently on an active trip.
- **Automated Lifecycle Transitions:**
  - Trip Start: Rig & Operator automatically transition to `On Trip`.
  - Trip Completion: Rig & Operator return to `Available` with mileage and fuel delta calculated.
  - Maintenance Booking: Rig locks to `Maintenance` status; automatically returns to `Available` upon job completion.
- **Live Document Expiry Sentinels:** Automated background alerts for approaching (<=30 days) and overdue Vehicle Insurance, Registration Certificates (RC), and Commercial Driver Licenses.
- **FleetAI Operations Co-Pilot:** Gemini 3.8 Flash integrated exclusively via server-side proxy route (`POST /api/ai/chat`) with live MongoDB context injection. **Zero client-side API key exposure.**

---

## 🛠️ Technology Stack

| Layer | Technology |
|---|---|
| **Database** | MongoDB & Mongoose ODM (with persistent local failover store) |
| **Backend Framework** | Node.js & Express.js |
| **Frontend Library** | React.js (JavaScript, Hooks, Context API) |
| **Styling & Design System** | Plain CSS with custom SaaS tokens, elevated glass cards, dark mode |
| **Artificial Intelligence** | Google Gemini API (`@google/genai` SDK, `gemini-3.8-flash`) |
| **Authentication** | JSON Web Tokens (JWT) + BCrypt password hashing |
| **Icons** | Lucide React |

---

## 📂 Project Structure

```
├── .env.example
├── .gitignore
├── index.html
├── metadata.json
├── package.json
├── server.ts                    # Full-stack server entry point (Express + Vite)
├── server/
│   ├── config/
│   │   └── db.js                # MongoDB connection & persistent store
│   ├── controllers/
│   │   ├── authController.js
│   │   ├── vehicleController.js
│   │   ├── driverController.js
│   │   ├── tripController.js
│   │   ├── fuelController.js
│   │   ├── maintenanceController.js
│   │   ├── expenseController.js
│   │   ├── notificationController.js
│   │   ├── dashboardController.js
│   │   └── aiController.js
│   ├── middleware/
│   │   ├── authMiddleware.js    # JWT verification
│   │   ├── roleMiddleware.js    # RBAC permissions
│   │   └── errorMiddleware.js   # Centralized error handler
│   ├── models/
│   │   ├── User.js
│   │   ├── Vehicle.js
│   │   ├── Driver.js
│   │   ├── Trip.js
│   │   ├── Fuel.js
│   │   ├── Maintenance.js
│   │   ├── Expense.js
│   │   ├── Notification.js
│   │   └── dataEngine.js        # Mongoose & unified persistence engine
│   ├── routes/
│   │   ├── authRoutes.js
│   │   ├── vehicleRoutes.js
│   │   ├── driverRoutes.js
│   │   ├── tripRoutes.js
│   │   ├── fuelRoutes.js
│   │   ├── maintenanceRoutes.js
│   │   ├── expenseRoutes.js
│   │   ├── notificationRoutes.js
│   │   ├── dashboardRoutes.js
│   │   ├── analyticsRoutes.js
│   │   └── aiRoutes.js
│   ├── services/
│   │   └── geminiService.js     # Gemini 3.8 Flash SDK integration
│   └── seed/
│       └── seedData.js          # Realistic demo fleet seeder
└── src/
    ├── assets/
    ├── components/
    │   ├── Navbar.jsx
    │   ├── Sidebar.jsx
    │   ├── ProtectedRoute.jsx
    │   ├── StatCard.jsx
    │   ├── DataTable.jsx
    │   ├── Modal.jsx
    │   ├── Loading.jsx
    │   ├── EmptyState.jsx
    │   ├── NotificationBell.jsx
    │   └── FleetAIChat.jsx      # Reusable Gemini AI chat interface
    ├── layouts/
    │   └── DashboardLayout.jsx
    ├── pages/
    │   ├── Login.jsx
    │   ├── Register.jsx
    │   ├── ForgotPassword.jsx
    │   ├── Dashboard.jsx
    │   ├── Vehicles.jsx
    │   ├── VehicleDetails.jsx
    │   ├── Drivers.jsx
    │   ├── DriverDetails.jsx
    │   ├── Trips.jsx
    │   ├── Fuel.jsx
    │   ├── Maintenance.jsx
    │   ├── Expenses.jsx
    │   ├── Analytics.jsx
    │   ├── Reports.jsx
    │   ├── Notifications.jsx
    │   ├── FleetAI.jsx
    │   ├── Profile.jsx
    │   └── Settings.jsx
    ├── context/
    │   └── AuthContext.jsx
    ├── services/
    │   └── api.js               # Centralized REST client
    ├── App.jsx
    ├── main.jsx
    └── index.css                # Plain CSS design tokens
```

---

## 👥 User Roles & Access Matrix

| Feature / Module | Admin | Fleet Manager | Driver |
|---|:---:|:---:|:---:|
| **Dashboard Telemetry** | Full | Full | Overview |
| **Manage Vehicles (CRUD)** | ✅ | ✅ | Read-Only |
| **Manage Drivers (CRUD)** | ✅ | ✅ | Read-Only |
| **Schedule & Assign Trips** | ✅ | ✅ | View & Status Update |
| **Log Fuel Refills** | ✅ | ✅ | ❌ |
| **Book & Complete Maintenance** | ✅ | ✅ | Read-Only |
| **Expense Ledger** | ✅ | ✅ | ❌ |
| **Analytics & BI** | ✅ | ✅ | ❌ |
| **Audit Reports & CSV Export** | ✅ | ✅ | ❌ |
| **FleetAI Assistant** | ✅ | ✅ | ✅ |
| **User Administration** | ✅ | ❌ | ❌ |

---

## 🏢 Multi-tenancy (SaaS)

Every customer company is an **organization**. All fleet data (vehicles, drivers, trips, fuel, maintenance,
expenses, notifications, users) belongs to exactly one organization and is isolated at the data layer:
the request's tenant context is set by the auth middleware and `DataEngine` scopes every query, create,
update and delete to it, so one organization can never read or change another one's records.

| Role | Scope |
|---|---|
| `super_admin` | Platform owner: manages organizations (create, suspend, change plan). No access to fleet data. |
| `admin` | Organization administrator: users, organization profile/branding, everything in the organization. |
| `fleet_manager` / `driver` | Same as before, inside their organization. |

- **Sign-up:** `POST /api/auth/register` creates a new organization (14-day trial) and its first admin.
  The platform owner can also create customers via `POST /api/platform/organizations`.
- **Plans:** `trial`, `basic`, `pro`, `enterprise` (`server/config/plans.js`) limit vehicles and users.
  An expired trial becomes read-only; a suspended organization cannot log in.
- **Per-organization login page:** `https://yourdomain/?org=<slug>` (or `<slug>.yourdomain`) shows the
  organization's name/logo, and the organization's brand color is applied after login.
- **Existing single-tenant data** (local JSON store) is moved into a "Default Organization" on first start.
  Migration of existing MongoDB data is not implemented yet.
- **Tests:** `npm test` runs the tenant-isolation integration tests.

---

## 📡 GPS tracking

Trackers are registered per organization on the **GPS Devices** page and linked to a vehicle. A tracker is
identified by its IMEI, which is unique across the whole platform, so incoming data is always stored in the
right organization.

| Protocol | How it connects | Authentication |
|---|---|---|
| **Teltonika** (Codec 8 / 8E) | TCP, default port `5027` (`GPS_TCP_PORT`, `0` disables it) | IMEI handshake (device must be registered) |
| **GT06 / Concox** (0x01 login, 0x13 heartbeat, 0x12/0x22 location, 0x16/0x26 alarm) | TCP, default port `5023` (`GT06_TCP_PORT`, `0` disables it) | IMEI in the login packet (device must be registered as `gt06`) |
| **OsmAnd / Traccar Client** | `GET/POST /api/gps/osmand?id=&key=&lat=&lon=&timestamp=&speed=<knots>&bearing=&altitude=` | device id + per-device secret key |

- Invalid data is dropped (no fix, impossible coordinates, timestamps from the future), retransmissions are
  de-duplicated, and a suspended organization or removed device is disconnected.
- `GET /api/tracking/live` returns the last position of every tracker (the Vehicles map refreshes it every 10 s);
  `GET /api/tracking/history?vehicleId=|deviceId=&from=&to=` returns a route with its distance (route playback in the UI).
- Try it without hardware: register a Teltonika device with a 15-digit IMEI, link it to a vehicle and run
  `npm run simulate -- --imei <IMEI>` (drives a fake truck from Ulaanbaatar towards Darkhan; add `--protocol gt06` for a GT06 tracker, which connects to port 5023).
- The local JSON store keeps the newest `GPS_LOCAL_POSITION_CAP` (default 200000) positions. It is meant for
  development: use MongoDB (or a time-series database) for real fleets.

### Geofences and alerts

- **Geofences** (circle or polygon, optionally limited to some vehicles) are drawn on the **Geofences** page. A
  vehicle crossing a fence creates an *entered* / *left* alert (each direction can be switched off).
- **Speed alert:** set the organization's speed limit in *Settings → Organization Profile* (`0` = off). An alert is
  raised once per speeding episode, after two consecutive over-limit reports (filters single GPS speed spikes).
- Alerts appear in the notification bell and under *Notifications → GPS Alerts*, in the viewer's language.
- Only live reports raise alerts: records older than 10 minutes (a tracker uploading its offline backlog) are
  stored but never alert, and the first position of a tracker only initializes its state. The same alert for the
  same vehicle/fence is limited to once a minute to avoid flapping at a boundary.

### Email and SMS alerts

Alerts (speeding, geofence enter/exit) can also be sent by email and SMS:

1. Configure the providers with environment variables (without them, messages are only *simulated* in the server log):

   | Channel | Variables |
   |---|---|
   | Email (SMTP) | `SMTP_HOST`, `SMTP_PORT` (587), `SMTP_SECURE` (`true` for port 465), `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM` |
   | SMS via Twilio | `SMS_PROVIDER=twilio`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM` |
   | SMS via any HTTP gateway | `SMS_PROVIDER=http`, `SMS_HTTP_URL`, `SMS_HTTP_TOKEN` (optional), `SMS_FROM` — receives `POST {to, text, from}` |

   Optional: `SMS_DEFAULT_COUNTRY_CODE` (976: 8-digit numbers are treated as Mongolian), `APP_BASE_URL` (link in
   emails), `ALERT_TIME_ZONE` (Asia/Ulaanbaatar).
2. An organization admin enables the channels, the alert types and the message language in
   *Settings → Alert Delivery*, and ticks which users receive email / SMS (users can also choose in their profile).
   *Send test to me* verifies a provider.
3. Deliveries are queued and sent by a background worker with retries (up to 4 attempts; provider rejections such
   as HTTP 4xx are not retried). Each organization has a daily limit per channel according to its plan, every
   delivery is logged (addresses masked) and messages are never sent for suspended organizations.

### GPS reports

*GPS Reports* summarizes what the trackers recorded over a period (up to 31 days) for the whole fleet or one vehicle:
distance, trips, driving time, stops and idling (engine on), max/average speed, speeding and geofence alerts, and
fuel purchased with km per litre. Click a vehicle for its trip and stop lists; every table exports to CSV
(`GET /api/reports/gps`, `GET /api/reports/gps.csv?type=vehicles|trips|stops`).

How the numbers are derived (`server/reports/gpsAnalysis.js`): a vehicle is *moving* at 3 km/h or more; a pause of
5 minutes or more is a *stop* (and ends the trip), shorter pauses such as traffic lights stay inside the trip;
reports more than 30 minutes apart are a *data gap* (nothing is assumed about it, no distance is added);
impossible jumps (over 250 km/h) and GPS drift while parked are ignored; trips under 100 m are dropped. Days are
split in the `ALERT_TIME_ZONE` time zone (default Asia/Ulaanbaatar). km per litre divides GPS distance by the fuel
logged in the same period, so it is only meaningful over periods that cover whole refuelling cycles.

GT06 trackers use CRC-ITU framed packets; the parser tolerates fragmented / batched frames, noise, corrupted frames
(ignored, the tracker re-sends) and unknown message types. GT06 has no "login rejected" reply, so an unknown or
unregistered tracker is simply disconnected. The ignition state comes from heartbeats and the 0x22 ACC byte.

Other tracker brands (Queclink, Ruptela, Meitrack, ...) are not implemented yet: add a parser next to
`server/gps/protocols/` and a listener in `server/gps/`, then register it in `startGpsServers()`.

---

## 🗄️ GPS position retention

Positions are deleted once they are older than the organization's plan allows: **trial 30 days, basic 90, pro 365, enterprise 730** (`positionRetentionDays` in `server/config/plans.js`, shown in the organization's plan limits). A background worker purges per organization (also suspended ones): first run one minute after start, then every 6 hours.

- `POSITION_RETENTION_DAYS=<n>` overrides every plan (`-1` keeps everything; `0`, fractions and non-numbers are ignored so a typo cannot wipe the data).
- `POSITION_PURGE_INTERVAL_MS`, `POSITION_PURGE_DELAY_MS` tune the worker.
- Implemented as a worker instead of a MongoDB TTL index because the retention differs per organization and a TTL index has one value for the whole collection. Run several app instances and each purges (harmless, just redundant). Trips, reports and the live view only see data inside the retention window. Notifications and delivery logs are not purged yet.

## 🧪 Tests

`npm test` runs the integration tests against the local JSON store. Set `TEST_MONGODB_URI` (for example `mongodb://127.0.0.1:27017`) to run the same tests on a real MongoDB: every spawned server gets its own throw-away database, and `REQUIRE_MONGODB=true` (set automatically) makes a failed connection fatal instead of silently falling back to the JSON store. CI runs both. `REQUIRE_MONGODB=true` is also a sensible production setting.

## 📡 Traccar as the GPS receiver (optional)

[Traccar](https://www.traccar.org) (Apache 2.0, 200+ protocols) can receive the trackers while FLEETNOVA keeps organizations, plans, alerts, reports and the UI. Traccar decodes the device protocol and forwards each position to `POST /api/gps/traccar`; the position then goes through the same ingestion as Teltonika / GT06 / OsmAnd (geofences, speed alerts, e-mail / SMS, reports).

- Enable it with `TRACCAR_FORWARD_TOKEN` (the endpoint answers 503 while unset). Traccar sends the token in the `forward.url` query (`?token=`); `X-Traccar-Token` / `Authorization: Bearer` also work if your Traccar version can add headers.
- Register devices with protocol **"Via Traccar server"**; the identifier is Traccar's `uniqueId` (6–32 letters, digits, `-`, `_`; usually the IMEI). Only devices of that protocol accept forwarded data.
- Optional device sync: `TRACCAR_URL` plus `TRACCAR_TOKEN` (or `TRACCAR_USER` / `TRACCAR_PASSWORD`). Creating / deleting a device here then creates / deletes it in Traccar (best effort: the response carries `traccarSync`: `synced` / `failed` / `not_configured`). Traccar drops data from unknown devices (`database.registerUnknown=false`).
- `docker-compose.traccar.yml` + `deploy/traccar/traccar.xml` run both together (set `GPS_TCP_PORT=0` / `GT06_TCP_PORT=0` so Traccar owns the tracker ports). Change the placeholder token and use PostgreSQL / MySQL for Traccar in production.
- Not verified here: a real Traccar server or tracker (tests use a mock Traccar API and forwarded JSON as documented by Traccar), and the exact `forward.*` keys of your Traccar version. Speed is converted from knots; Traccar keeps its own copy of the positions, so plan the storage twice.

## 🔐 Sign-up security: email confirmation and rate limits

**Email confirmation.** New self-service accounts must confirm their email address before the first sign-in (the
confirmation link is valid for 24 hours and works once; asking for a new link invalidates the old one, with a
60 second cool-down). It is required when `REQUIRE_EMAIL_VERIFICATION=true`, or - if the variable is not set - when
an SMTP server is configured; `REQUIRE_EMAIL_VERIFICATION=false` turns it off. Without SMTP in development the link
is printed in the server log. Users invited by an organization admin, organizations created by the platform owner
and accounts that existed before this feature are treated as confirmed. Set `APP_BASE_URL` (e.g.
`https://fleet.example.com`) so the links point to your site.

**Rate limits** (per client IP, in memory - see the note below):

| Endpoint | Default | Counted |
|---|---|---|
| Sign in (per account + IP / per IP) | 8 / 60 per 15 min | failed attempts only, so a locked account stays locked even with the right password until the window ends |
| Sign up | 5 per hour | every attempt |
| Forgot password | 5 per hour per address + IP | every attempt |
| Resend confirmation | 3 per hour per address, 10 per IP | every attempt |
| Confirm email | 30 per hour | every attempt |
| Public organization page | 60 per minute | every request |
| Whole API | 1200 per minute | every request |

Over the limit the API answers `429` with `Retry-After`, `RateLimit-*` headers and a JSON body
`{ code: "RATE_LIMITED", retryAfter }` that the web UI turns into "try again in N seconds". Tune a limiter with
`RATE_LIMIT_<NAME>_MAX` / `RATE_LIMIT_<NAME>_WINDOW_SEC` (names: `API`, `REGISTER`, `LOGIN`, `LOGIN_IP`,
`PASSWORD_RESET`, `VERIFY`, `RESEND_IP`, `RESEND_EMAIL`, `PUBLIC`) or switch everything off with
`RATE_LIMIT_DISABLED=true`. Behind a reverse proxy set `TRUST_PROXY=1` (number of proxies) so the real client IP is
used; otherwise every visitor looks like the proxy and shares one limit.

The counters live in the server process. With several instances each counts on its own: enforce the limits at the
reverse proxy as well, or move the counters to a shared store (Redis) behind `server/middleware/rateLimit.js`.
### Password reset

- `POST /api/auth/forgot-password` always answers the same 200 (no account enumeration). For active accounts it emails a single-use link `/?reset=<token>`; only the sha256 hash is stored. The newest link wins; a per-account cooldown limits resends.
- `POST /api/auth/reset-password` sets the new password (8+ chars, max 72 bytes), consumes the token, signs out **every** existing session (JWT `tv` claim vs `tokenVersion`), confirms the email address, and sends a "password changed" notice. Changing the password from the profile page also ends other sessions and returns a fresh token.
- Env: `PASSWORD_RESET_TTL_MS` (default 1h), `PASSWORD_RESET_COOLDOWN_MS` (default 60s), `RATE_LIMIT_RESET_MAX` / `RATE_LIMIT_RESET_WINDOW_SEC`.
- Not verified against a real SMTP provider (tests use a mock SMTP server); rate-limit counters are in memory.

---

## 🔑 Demo Credentials

Only created in development (or with `SEED_DEMO_DATA=true`):

| Organization | Role | Email | Password |
|---|---|---|---|
| Platform | **Super Admin** | `superadmin@fleetnova.com` | `super123` |
| Монгол Карго ХХК (`mongol-cargo`) | **Admin** | `admin@fleetnova.com` | `admin123` |
| Монгол Карго ХХК | **Fleet Manager** | `manager@fleetnova.com` | `manager123` |
| Монгол Карго ХХК | **Driver** | `driver@fleetnova.com` | `driver123` |
| Алтан Тээвэр ХХК (`altan-teever`) | **Admin** | `altan@fleetnova.com` | `altan123` |

*(One-click demo buttons are shown on the Login screen in development builds only).*

---

## ⚙️ Environment Variables

Copy `.env.example` to `.env`:

```bash
PORT=3000
MONGODB_URI=mongodb+srv://<username>:<password>@cluster.mongodb.net/fleetnova
JWT_SECRET=your_jwt_secret_key_fleetnova_2026
GEMINI_API_KEY=your_google_gemini_api_key

# GPS tracker listener (0 = disabled)
GPS_TCP_PORT=5027
GT06_TCP_PORT=5023

# Sign-up security (see "Sign-up security")
APP_BASE_URL=https://fleet.example.com
REQUIRE_EMAIL_VERIFICATION=true
TRUST_PROXY=1

# Alert delivery (see "Email and SMS alerts")
SMTP_HOST=smtp.example.com
SMS_PROVIDER=twilio

# Production: creates the platform owner (super admin) on an empty database
ADMIN_EMAIL=owner@yourcompany.com
ADMIN_PASSWORD=choose-a-strong-password
```

---

## 🚀 Installation & Running

1. **Install Dependencies:**
   ```bash
   npm install
   ```

2. **Seed Initial Database:**
   ```bash
   npm run seed
   ```

3. **Start Full-Stack Development Server:**
   ```bash
   npm run dev
   ```
   Open `http://localhost:3000` in your browser.

4. **Production Build:**
   ```bash
   npm run build
   npm start
   ```

---

## 🤖 FleetAI Gemini Integration

The assistant communicates strictly via `POST /api/ai/chat`:
1. User submits question via UI.
2. Express server validates JWT authentication.
3. Server retrieves live snapshot from MongoDB (active trips, maintenance tickets, fuel expenditures, document alerts).
4. System prompt enforces strictly grounded, read-only analysis.
5. Gemini 3.8 Flash formats actionable suggestions with highlighted financial and operational metrics.
