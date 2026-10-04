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

## 🔑 Demo Credentials

| Role | Email | Password |
|---|---|---|
| **System Admin** | `admin@fleetnova.com` | `admin123` |
| **Fleet Manager** | `manager@fleetnova.com` | `manager123` |
| **Commercial Driver** | `rajesh.kumar@fleetnova.com` | `driver123` |

*(One-click demo buttons are provided directly on the Login screen).*

---

## ⚙️ Environment Variables

Copy `.env.example` to `.env`:

```bash
PORT=3000
MONGODB_URI=mongodb+srv://<username>:<password>@cluster.mongodb.net/fleetnova
JWT_SECRET=your_jwt_secret_key_fleetnova_2026
GEMINI_API_KEY=your_google_gemini_api_key
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
