# Canaan ERP - Fleet & Logistics Management System

A comprehensive Enterprise Resource Planning (ERP) system for **Canaan Global International** designed to manage fleet operations, driver assignments, trip tracking, maintenance, and logistics workflows.

---

## 📋 Table of Contents

- [Project Overview](#project-overview)
- [Tech Stack](#tech-stack)
- [System Requirements](#system-requirements)
- [Installation & Setup](#installation--setup)
  - [Step 1: Clone Repository](#step-1-clone-the-repository)
  - [Step 2: Setup MySQL](#step-2-setup-mysql-database)
  - [Step 2.5: Configure .env](#step-25-configure-environment-variables-env)
  - [Step 3: Setup Backend](#step-3-setup-backend)
  - [Step 4: Setup Frontend](#step-4-setup-frontend)
- [Running the Application](#running-the-application)
- [Project Structure](#project-structure)
- [Database Schema](#database-schema)
- [API Documentation](#api-documentation)
- [Features](#features)
- [Troubleshooting](#troubleshooting)

---

## 🎯 Project Overview

**Canaan ERP** is a full-stack application for managing:
- **Fleet Management** - Track vehicles, maintenance, and assignments
- **Driver Management** - Maintain driver profiles, licenses, and compliance records
- **Trip Lifecycle** - Create, assign, track, and close trips with comprehensive expense tracking
- **Financial Management** - Billing, payments, and expense reconciliation
- **Attendance & Payroll** - Employee attendance and compensation tracking
- **Vendor Management** - Manage third-party vendors and service providers

The system follows a **microservices-inspired architecture** with a **Next.js 16 frontend** and **FastAPI backend** communicating via REST API.

---

## 💻 Tech Stack

### Frontend
- **Framework**: Next.js 16.2.9 (App Router)
- **Runtime**: React 19.2.4
- **Language**: TypeScript 5
- **Styling**: Tailwind CSS 4 with custom GPU-accelerated animations
- **UI Components**: Lucide React Icons
- **Charts**: Recharts for data visualization
- **Build Tool**: Turbopack (Next.js built-in)

### Backend
- **Framework**: FastAPI (async Python web framework)
- **Database**: MySQL (with SQLAlchemy ORM)
- **Async Driver**: PyMySQL
- **API Docs**: Automatic Swagger UI at `/docs`
- **CORS**: Enabled for frontend development

### Development Tools
- **Git**: Version control with branch-based workflow
- **Node Package Manager**: npm 10+ (for frontend dependencies)
- **Python**: 3.8+ (for backend)
- **Database**: MySQL 8.0+

---

## 📦 System Requirements

### Minimum Requirements
- **macOS/Linux/Windows** with terminal access
- **Node.js** 18+ with npm 10+
- **Python** 3.8+
- **MySQL** 8.0+ (running locally or remote)
- **4GB RAM** (8GB recommended)
- **2GB free disk space**

### Optional
- **Conda** (for Python environment management)
- **Git** 2.0+ (for version control)
- **Docker** (for containerized MySQL)

---

## 🚀 Installation & Setup

### Step 1: Clone the Repository

```bash
cd /path/to/projects
git clone <repository-url>
cd canaan_erp
```

### Step 2: Setup MySQL Database

#### Option A: Local MySQL (macOS with Homebrew)
```bash
# Install MySQL
brew install mysql

# Start MySQL service
brew services start mysql

# Verify MySQL is running
mysql --version

# Create database and user
mysql -u root -e "CREATE DATABASE IF NOT EXISTS canaan CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
mysql -u root -e "CREATE USER IF NOT EXISTS 'root'@'localhost' IDENTIFIED BY 'alan#2005';"
mysql -u root -e "GRANT ALL PRIVILEGES ON canaan.* TO 'root'@'localhost';"
mysql -u root -e "FLUSH PRIVILEGES;"
```

#### Option B: Docker (Cross-platform)
```bash
# Start MySQL in Docker
docker run --name canaan-mysql \
  -e MYSQL_DATABASE=canaan \
  -e MYSQL_ROOT_PASSWORD=alan#2005 \
  -p 3306:3306 \
  -d mysql:8.0

# Verify container is running
docker ps | grep canaan-mysql
```

#### Option C: Remote MySQL
For remote MySQL instances, set the DATABASE_URL environment variable in your .env file (see Step 2.5 below).

### Step 2.5: Configure Environment Variables (.env)

**IMPORTANT: Never commit `.env` file to GitHub. Use `.env.example` as a template.**

#### Backend Environment Setup

1. **Navigate to backend directory**
```bash
cd frontend/backend
```

2. **Copy the example file**
```bash
cp .env.example .env
```

3. **Edit `.env` file** with your actual credentials
```bash
# On macOS/Linux
nano .env
# or
vim .env

# On Windows
notepad .env
```

4. **Set your MySQL credentials in `.env`**
```env
# ============================================================================
# Canaan ERP - Backend Environment Variables
# ============================================================================

# Database Configuration (REQUIRED)
# Format: mysql+pymysql://username:password@host:port/database
# Default: mysql+pymysql://root:password@localhost/canaan
DATABASE_URL=mysql+pymysql://root:alan#2005@localhost/canaan

# FastAPI Settings
DEBUG=False
API_PORT=8000
API_HOST=0.0.0.0

# Security (Optional)
SECRET_KEY=your-secret-key-here
```

**Example Database URLs:**

```bash
# Local MySQL (default)
DATABASE_URL=mysql+pymysql://root:alan#2005@localhost/canaan

# Local MySQL with different port
DATABASE_URL=mysql+pymysql://root:password@localhost:3307/canaan

# Remote MySQL
DATABASE_URL=mysql+pymysql://username:password@db.example.com:3306/canaan

# Docker MySQL
DATABASE_URL=mysql+pymysql://root:password@host.docker.internal:3306/canaan
```

5. **Verify `.env` is in `.gitignore`**
```bash
# Check if .env is ignored
cat .gitignore | grep "\.env"
# Should output: .env*
```

#### Frontend Environment Setup (Optional)

1. **Navigate to frontend directory**
```bash
cd ../
```

2. **Create or edit `.env.local`**
```bash
# Backend API URL (if not running on default localhost:8000)
NEXT_PUBLIC_API_URL=http://localhost:8000

# Optional: Feature flags, feature toggles
# NEXT_PUBLIC_FEATURE_X=true
```

**Note:** Frontend `.env.local` is already in `.gitignore`

---

### Step 3: Setup Backend

#### Navigate to Backend Directory
```bash
cd frontend/backend
```

#### Create Python Virtual Environment (Recommended)
```bash
# Using venv
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Or using conda (if installed)
conda activate canaan_env  # Create if needed: conda create -n canaan_env python=3.9
```

#### Install Backend Dependencies
```bash
# First, upgrade pip
pip install --upgrade pip setuptools wheel

# Install required packages
pip install fastapi uvicorn sqlalchemy pymysql
```

#### Initialize Database
```bash
# Clear and reset database (if needed)
python3 clear_database.py

# Or seed sample data
python3 seed.py
```

### Step 4: Setup Frontend

#### Navigate to Frontend Directory
```bash
cd ..  # Back to frontend directory
```

#### Install Frontend Dependencies
```bash
npm install
# or with yarn
yarn install
```

#### Environment Configuration (if needed)
Create `.env.local` file in `frontend/` directory:
```bash
# Backend API URL
NEXT_PUBLIC_API_URL=http://localhost:8000

# Optional: API keys, feature flags, etc.
```

---

## 🎮 Running the Application

### Option 1: Start Both Services Manually (Recommended for Development)

#### Terminal 1 - Backend
```bash
cd frontend/backend
source venv/bin/activate  # Activate Python environment if used

# Start FastAPI server with auto-reload
uvicorn main:app --host 0.0.0.0 --port 8000 --reload

# You should see:
# INFO:     Uvicorn running on http://0.0.0.0:8000
# INFO:     Application startup complete
```

#### Terminal 2 - Frontend
```bash
cd frontend
npm run dev

# You should see:
# ▲ Next.js 16.2.9
# - Local:        http://localhost:3000
# - Environments: .env.local
# ✓ Ready in 1234ms
```

#### Terminal 3 - (Optional) Monitor Database
```bash
mysql -u root -p
# Enter password: alan#2005

# In MySQL shell:
USE canaan;
SHOW TABLES;
SELECT COUNT(*) FROM trips;
```

### Option 2: Start Both Services Together (macOS Only)

```bash
# Make the start script executable
chmod +x start.sh

# Run the start script (opens two Terminal windows)
./start.sh

# Output:
# ==> Both services started in new Terminal windows.
#     Backend:  http://localhost:8000
#     Frontend: http://localhost:3000
#     API docs: http://localhost:8000/docs
```

### Option 3: Production Build

#### Frontend Production Build
```bash
cd frontend
npm run build
npm run start

# Access at http://localhost:3000
```

#### Backend Production
```bash
cd frontend/backend

# Use gunicorn with uvicorn workers
pip install gunicorn

gunicorn main:app \
  --workers 4 \
  --worker-class uvicorn.workers.UvicornWorker \
  --bind 0.0.0.0:8000 \
  --access-logfile - \
  --error-logfile -
```

---

## 📁 Project Structure

```
canaan_erp/
├── frontend/                          # Next.js frontend application
│   ├── src/
│   │   ├── app/                      # Next.js App Router pages
│   │   │   ├── page.tsx              # Dashboard home
│   │   │   ├── trips/                # Trip management pages
│   │   │   │   ├── assign/page.tsx   # Assign trips
│   │   │   │   ├── current/page.tsx  # Current/in-progress trips
│   │   │   │   ├── completed/page.tsx # Completed trips
│   │   │   │   ├── verification/page.tsx
│   │   │   │   ├── reconciliation/page.tsx
│   │   │   │   └── finalization/page.tsx
│   │   │   ├── trucks/page.tsx
│   │   │   ├── drivers/page.tsx
│   │   │   ├── customers/page.tsx
│   │   │   ├── attendance/page.tsx
│   │   │   ├── maintenance/page.tsx
│   │   │   └── finance/page.tsx
│   │   ├── components/
│   │   │   ├── ui/                   # Reusable UI components
│   │   │   ├── trips/                # Trip-specific components
│   │   │   │   ├── TripTable.tsx
│   │   │   │   ├── TripFormDialog.tsx
│   │   │   │   ├── CloseTripDialog.tsx
│   │   │   │   ├── VerifyTripDialog.tsx
│   │   │   │   └── [other trip dialogs]
│   │   │   └── [other feature components]
│   │   ├── types/                    # TypeScript type definitions
│   │   │   ├── trip.ts               # Trip model
│   │   │   ├── truck.ts              # Truck model
│   │   │   ├── driver.ts             # Driver model
│   │   │   ├── customer.ts           # Customer model
│   │   │   ├── trip-closure.ts       # Trip closure model
│   │   │   └── [other types]
│   │   └── lib/
│   │       ├── api.ts                # API client and transformers
│   │       ├── trip-data.ts          # Sample trip data
│   │       ├── truck-data.ts         # Sample truck data
│   │       └── [other utilities]
│   ├── public/                        # Static assets
│   ├── backend/                       # FastAPI backend (NEW!)
│   │   ├── main.py                   # FastAPI application entry point
│   │   ├── database.py               # SQLAlchemy setup & MySQL connection
│   │   ├── models.py                 # SQLAlchemy ORM models
│   │   ├── schemas.py                # Pydantic request/response schemas
│   │   ├── routers/                  # API route handlers
│   │   │   ├── trips.py              # Trip CRUD operations
│   │   │   ├── drivers.py            # Driver management
│   │   │   ├── trucks.py             # Vehicle management
│   │   │   ├── customers.py          # Customer management
│   │   │   ├── attendance.py         # Attendance tracking
│   │   │   ├── maintenance.py        # Maintenance records
│   │   │   ├── finance.py            # Financial operations
│   │   │   └── [other routers]
│   │   ├── clear_database.py         # Database reset utility
│   │   ├── seed.py                   # Sample data seeding
│   │   └── __pycache__/
│   ├── package.json                   # Frontend dependencies
│   ├── tsconfig.json                  # TypeScript configuration
│   ├── tailwind.config.ts             # Tailwind CSS configuration
│   ├── next.config.ts                 # Next.js configuration
│   └── .env.local                     # Local environment variables
├── start.sh                           # Script to start both services
├── README.md                          # This file
└── .git/                              # Git repository

```

---

## 🗄️ Database Schema

### Key Tables

#### **Trips Table**
- Trip lifecycle: Assigned → Started → Completed → Closed
- Tracks: Booking reference, container specs, cargo details, pricing
- Fields: trip_id, status, assigned_date, trip_date, origin, destination, etc.

#### **Trip Closures Table**
- Detailed expense tracking when trip is closed
- Sections:
  - Edit Booking (auto-fetched trip info)
  - Transporter Details (pricing breakdown)
  - Billing Details (billing amounts)
  - Distance, Weight, Fuel tracking
  - 15+ expense categories

#### **Drivers Table**
- Driver profiles with compliance tracking
- Form 11, License expiry, Banking details
- Software credentials for fleet management

#### **Trucks Table**
- Vehicle inventory with branch locations
- Maintenance history, assignment tracking
- Technical specifications and GPS tracking

#### **Customers Table**
- Business contact information
- Rating, additional fields, KYC verification
- Service history and billing preferences

#### **Attendance Table**
- Daily attendance tracking
- Clock in/out times
- Leave management

#### **Maintenance Table**
- Service records and spare parts tracking
- Cost tracking and vendor management
- Preventive maintenance scheduling

---

## 📚 API Documentation

### Access API Docs

Once the backend is running, visit:
```
http://localhost:8000/docs  → Swagger UI (interactive)
http://localhost:8000/redoc  → ReDoc (read-only)
```

### Sample API Endpoints

```bash
# Health check
GET http://localhost:8000/

# Trip operations
GET    /trips                      # List all trips
POST   /trips                      # Create new trip
GET    /trips/{id}                 # Get trip details
PUT    /trips/{id}                 # Update trip
DELETE /trips/{id}                 # Delete trip
PUT    /trips/{id}/status          # Update trip status
POST   /trips/{id}/closure         # Close a trip

# Driver operations
GET    /drivers                     # List drivers
POST   /drivers                     # Create driver
GET    /drivers/{id}                # Get driver details
PUT    /drivers/{id}                # Update driver

# Truck operations
GET    /trucks                      # List trucks
POST   /trucks                      # Create truck
GET    /trucks/{id}                 # Get truck details
PUT    /trucks/{id}                 # Update truck

# Customer operations
GET    /customers                   # List customers
POST   /customers                   # Create customer
GET    /customers/{id}              # Get customer details
PUT    /customers/{id}              # Update customer
```

---

## ✨ Features

### Trip Management
- ✅ Create and assign trips to drivers
- ✅ Track trip status: Assigned → Started → Completed → Closed
- ✅ Dynamic cargo field rendering based on container type
- ✅ Auto-calculated distances using odometer readings
- ✅ Comprehensive expense tracking during trip closure
- ✅ Trip verification and reconciliation workflow
- ✅ Multi-container and open cargo support

### Vehicle Management
- ✅ Fleet inventory tracking
- ✅ Branch-wise vehicle allocation
- ✅ Maintenance history and scheduling
- ✅ GPS tracking integration (architecture-ready)

### Driver Management
- ✅ Comprehensive driver profiles
- ✅ License and compliance tracking
- ✅ Banking and payment method details
- ✅ Form 11 compliance tracking
- ✅ Software credential management

### Financial Management
- ✅ Multi-level pricing: Transport vs. Billing
- ✅ Advance payment tracking (Cash, NEFT, UPI, etc.)
- ✅ Halt compensation calculation
- ✅ Expense categorization (15+ categories)
- ✅ Bill-to tracking (Customer or Consignee)

### Reporting & Analytics
- ✅ Dashboard with KPI cards
- ✅ Charts and visualizations
- ✅ Trip status aggregation
- ✅ Financial summary reports

### UI/UX Features
- ✅ Glass-morphism design pattern
- ✅ GPU-accelerated animations
- ✅ Responsive grid layouts
- ✅ Real-time form validation
- ✅ Animated transitions and hover effects

---

## 🔧 Troubleshooting

### Backend Issues

#### 1. "Connection refused" to MySQL
```bash
# Check if MySQL is running
mysql -u root -p

# If not running, start it:
brew services start mysql  # macOS
sudo systemctl start mysql  # Linux
```

#### 2. "Module not found: fastapi"
```bash
# Reinstall dependencies
pip install -r requirements.txt

# Or install individually:
pip install fastapi uvicorn sqlalchemy pymysql
```

#### 3. "Database does not exist"
```bash
# Reset database
cd frontend/backend
python3 clear_database.py

# Or create manually:
mysql -u root -p
CREATE DATABASE canaan;
EXIT;
```

#### 4. "Port 8000 already in use"
```bash
# Find process using port 8000
lsof -i :8000

# Kill the process
kill -9 <PID>

# Or use a different port:
uvicorn main:app --port 8001
```

### Frontend Issues

#### 1. "npm modules not found"
```bash
# Clear node_modules and reinstall
cd frontend
rm -rf node_modules package-lock.json
npm install
```

#### 2. "Port 3000 already in use"
```bash
# Use a different port
npm run dev -- -p 3001
```

#### 3. "Cannot connect to backend API"
```bash
# Check backend is running on :8000
curl http://localhost:8000/

# Update .env.local if backend is on different port:
NEXT_PUBLIC_API_URL=http://localhost:8000
```

#### 4. "Build fails with TypeScript errors"
```bash
# Check for type errors
npm run lint

# Clear Next.js cache
rm -rf .next

# Rebuild
npm run build
```

### Database Issues

#### 1. "Slow queries"
```bash
# Optimize database
mysql -u root -p canaan < frontend/backend/clear_database.sql
```

#### 2. "Lost MySQL connection"
```bash
# Check connection string in frontend/backend/database.py
# Verify MySQL is still running
mysql -u root -p -e "SELECT 1;"
```

#### 3. "Incorrect password"
```bash
# Reset MySQL root password (macOS):
mysqladmin -u root password 'alan#2005'

# Update database.py with correct credentials
```

---

## 📞 Support & Documentation

### Key Documentation Files
- **CLAUDE.md** - Developer guidelines and conventions
- **AGENTS.md** - Next.js specific instructions
- **frontend/QUICK_REFERENCE_ANIMATIONS.md** - Animation guide

### Common Commands Reference

```bash
# Frontend
npm run dev       # Development server
npm run build     # Production build
npm run start     # Production server
npm run lint      # Code linting

# Backend
uvicorn main:app --reload        # Development server
python3 clear_database.py        # Reset database
python3 seed.py                  # Seed sample data

# Database
mysql -u root -p                 # Connect to MySQL
mysql -u root canaan < dump.sql  # Restore from backup
```

### Useful Links
- **Next.js Docs**: https://nextjs.org/docs
- **FastAPI Docs**: https://fastapi.tiangolo.com
- **SQLAlchemy Docs**: https://docs.sqlalchemy.org
- **Tailwind CSS**: https://tailwindcss.com
- **React 19**: https://react.dev

---

## 🤝 Contributing

1. Create a feature branch: `git checkout -b feature/your-feature`
2. Commit changes: `git commit -m "Add your feature"`
3. Push to branch: `git push origin feature/your-feature`
4. Submit pull request for review

---

## 📄 License

This project is proprietary software for **Canaan Global International**.

---

## 🏗️ Technical Architecture

### System Architecture Diagram

```
CLIENT BROWSER → FRONTEND (Next.js 3000) → API (FastAPI 8000) → DATABASE (MySQL 3306)
```

### Data Flow: Trip Lifecycle

```
CREATE → ASSIGN → STARTED → COMPLETED → CLOSE → RECONCILIATION
```

---

## 🔐 Type System & Data Validation

### Frontend Type Safety (TypeScript)

The application uses strict TypeScript typing across all data models:

- **Trip.ts** - 50+ fields with conditional cargo fields based on `containerSpecification`
- **TripClosure.ts** - 65+ fields organized into 10 sections (booking, pricing, expenses)
- **Driver.ts** - Driver profiles with compliance tracking (30+ fields)
- **Truck.ts** - Vehicle inventory with branch tracking (40+ fields)
- **Customer.ts** - Business relationships (20+ fields)

### Backend ORM Models (SQLAlchemy)

All backend models use SQLAlchemy ORM with:
- Automatic relationship management
- Foreign key constraints
- Type validation through Pydantic schemas
- Automatic created_at/updated_at timestamps

Example model structure:
```python
class Trip(Base):
    __tablename__ = "trips"
    id = Column(Integer, primary_key=True)
    trip_id = Column(String, unique=True)
    status = Column(Enum(...), default="Available")
    # 50+ more columns
    
    # Relationships
    driver = relationship("Driver", back_populates="trips")
    vehicle = relationship("Truck", back_populates="trips")
    closure = relationship("TripClosure", uselist=False, back_populates="trip")
```

---

## 🔄 API Transformation Pipeline

Frontend-to-Backend data transformation:

```
TypeScript (camelCase)
    ↓
    fromTrip() transformer converts to snake_case
    ↓
    POST /trips API receives snake_case JSON
    ↓
    Pydantic schema validates data structure
    ↓
    SQLAlchemy ORM saves to MySQL
    ↓
    Response returns snake_case JSON
    ↓
    toTrip() transformer converts back to camelCase
    ↓
    React components render with TypeScript safety
```

Example transformation:
```javascript
// Frontend sends
{ tripId: "TRP-1050", transportHireAmount: "32000" }

// API receives
{ trip_id: "TRP-1050", transport_hire_amount: 32000 }

// Frontend displays
{ tripId: "TRP-1050", transportHireAmount: "32000" }
```

---

## 🎨 Frontend Architecture

### Component Structure

```
App Layout
├── Header / Navigation
├── Sidebar Menu
├── Main Content
│   ├── Page (e.g., TripAssignPage)
│   │   ├── TripTable Component
│   │   │   ├── TripRow (repeats)
│   │   │   │   └── Actions Column
│   │   │   │       ├── Edit Icon
│   │   │   │       ├── Mark as Started Button
│   │   │   │       └── Delete Icon
│   │   │   └── Empty State
│   │   └── Dialog Components
│   │       ├── TripFormDialog
│   │       ├── CloseTripDialog
│   │       ├── VerifyTripDialog
│   │       └── TripSheetDialog
│   └── Loading / Error States
└── Footer
```

### State Management Flow

```
Page Component (useState)
├── trips: Trip[]
├── loading: boolean
├── dialogOpen: boolean
├── selectedTrip: Trip | null
│
├── useEffect()
│   └── Load data from API on mount
│
├── Handler Functions
│   ├── handleSave() → API call → Update state
│   ├── handleEdit() → Set selectedTrip → Open dialog
│   ├── handleMarkStarted() → API call → Update status
│   └── handleDelete() → API call → Remove from state
│
└── Render
    ├── Pass state to TripTable
    ├── Pass handlers as callbacks
    └── Dialogs receive selectedTrip as prop
```

---

## 💾 Database Schema Organization

### Table Relationships

```
customers (1) ←── (M) trips
drivers (1)   ←── (M) trips
trucks (1)    ←── (M) trips
trips (1)     ←── (1) trip_closures
trips (1)     ←── (1) trip_sheets
trips (1)     ←── (M) trip_verifications

drivers (1)   ←── (M) attendance_records
trucks (1)    ←── (M) maintenance_records
vendors (1)   ←── (M) maintenance_records
```

### Core Tables

| Table | Purpose | Key Fields | Count |
|-------|---------|-----------|-------|
| **trips** | Main trip records | trip_id, status, assigned_date, trip_date, origin, destination | 50+ |
| **trip_closures** | Trip closure with expenses | booking_reference_no, transport_hire_amount, billing_hire_amount, expenses | 65+ |
| **trip_sheets** | Financial reconciliation | hire_amount, diesel_entries, driver_advance | 20+ |
| **drivers** | Driver profiles | driver_id, name, license_number, compliance fields | 30+ |
| **trucks** | Vehicle inventory | truck_id, registration_number, branch_location | 40+ |
| **customers** | Business entities | customer_id, name, contact, rating | 20+ |

---

## 🚀 Performance Features

### Frontend Performance

1. **Next.js 16 Optimizations**
   - Automatic code splitting per route
   - Image optimization with next/image
   - Static generation where possible
   - API route caching

2. **TypeScript Benefits**
   - Compile-time error detection
   - IDE autocomplete and refactoring
   - Self-documenting code

3. **Tailwind CSS 4**
   - CSS-in-JS compiled to static files
   - GPU-accelerated animations
   - Zero runtime overhead
   - Optimal class purging

4. **React 19 Features**
   - Server Components for data fetching
   - Automatic batching of updates
   - Suspense for async operations
   - Concurrent rendering

### Backend Performance

1. **FastAPI Features**
   - Async/await for concurrent requests
   - Automatic OpenAPI documentation
   - Type validation with Pydantic
   - ~1ms request handling

2. **SQLAlchemy Optimizations**
   - Connection pooling (pool_recycle=3600s)
   - Query result caching
   - Eager loading for relationships
   - Lazy loading by default

3. **MySQL Indexing**
   - Primary keys on all tables
   - Foreign key indexes
   - Status field indexes (frequent filtering)
   - Composite indexes for common queries

---

## 🔧 Configuration Files

### Frontend Configuration

**next.config.ts**
```typescript
const config: NextConfig = {
  reactStrictMode: true,
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production',
  },
};
```

**tailwind.config.ts**
```typescript
// Custom animations with GPU acceleration
theme: {
  extend: {
    keyframes: {
      'backdrop-in': { /* ... */ },
      'dialog-enter': { /* ... */ },
      'scale-in': { /* ... */ },
    },
  },
}
```

**tsconfig.json**
- Strict mode enabled
- Path aliases configured
- ES2020 target
- DOM and Node.js lib types

### Backend Configuration

**database.py**
```python
DATABASE_URL = "mysql+pymysql://root:alan#2005@localhost/canaan"
engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,      # Verify connections before use
    pool_recycle=3600,       # Recycle connections after 1 hour
    echo=False               # Set to True for SQL logging
)
```

**main.py**
```python
app = FastAPI(
    title="Canaan ERP API",
    version="1.0.0",
    docs_url="/docs",        # Swagger UI
    redoc_url="/redoc",      # ReDoc
)

# CORS enabled for frontend dev
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],     # Restrict in production
    allow_methods=["*"],
    allow_headers=["*"],
)
```

---

## 🧪 Testing Guide

### Manual API Testing

Using curl or Postman:

```bash
# Health check
curl http://localhost:8000/

# List all trips
curl http://localhost:8000/trips

# Create a trip
curl -X POST http://localhost:8000/trips \
  -H "Content-Type: application/json" \
  -d '{
    "trip_id": "TRP-1051",
    "status": "Available",
    "booking_reference_no": "REF001",
    ...
  }'

# Update trip status
curl -X PUT http://localhost:8000/trips/1/status \
  -H "Content-Type: application/json" \
  -d '{"status": "Started"}'

# Close a trip
curl -X POST http://localhost:8000/trips/1/closure \
  -H "Content-Type: application/json" \
  -d '{
    "transport_hire_amount": 32000,
    "billing_hire_amount": 30000,
    "drivers_compensation": 500,
    ...
  }'
```

### Frontend Testing

```bash
# Type checking
npm run lint

# Build verification
npm run build

# Dev server testing
npm run dev
# Visit http://localhost:3000
```

---

## 📊 Query Examples

### Get Trip with All Related Data

```sql
SELECT 
    t.*,
    d.name as driver_name,
    tr.registration_number,
    c.name as customer_name,
    tc.transport_hire_amount,
    tc.total_distance
FROM trips t
LEFT JOIN drivers d ON t.driver_id = d.driver_id
LEFT JOIN trucks tr ON t.vehicle_id = tr.truck_id
LEFT JOIN customers c ON t.customer_id = c.id
LEFT JOIN trip_closures tc ON t.id = tc.trip_id
WHERE t.trip_id = 'TRP-1050';
```

### Financial Summary by Month

```sql
SELECT 
    DATE_FORMAT(t.assigned_date, '%Y-%m') as month,
    COUNT(t.id) as total_trips,
    SUM(t.transport_hire_amount) as total_hire,
    SUM(tc.port_pass_expense + tc.weight_sheet_expense) as total_expenses
FROM trips t
LEFT JOIN trip_closures tc ON t.id = tc.trip_id
WHERE t.status = 'Completed'
GROUP BY DATE_FORMAT(t.assigned_date, '%Y-%m');
```

---

## 🔐 Security Considerations

### Development vs Production

**Development Setup** (Current)
- CORS enabled for all origins
- Debug mode enabled
- MySQL password in code (development only!)
- No authentication required

**Production Checklist**
- [ ] Restrict CORS origins
- [ ] Enable authentication (JWT/OAuth)
- [ ] Use environment variables for secrets
- [ ] Enable HTTPS/TLS
- [ ] Set `echo=False` in SQLAlchemy
- [ ] Use connection pooling limits
- [ ] Add rate limiting
- [ ] Enable request validation
- [ ] Implement logging and monitoring
- [ ] Regular security audits

### Environment Variables (Production)

Create `.env` file:
```bash
# Database
DATABASE_URL=mysql+pymysql://user:pass@host:port/database

# API
API_PORT=8000
API_HOST=0.0.0.0
DEBUG=False

# Security
CORS_ORIGINS=["https://yourdomain.com"]
SECRET_KEY=your-secret-key-here
```

---

## 📈 Scaling Guide

### Horizontal Scaling

1. **Frontend** - Deploy to CDN (Vercel, Netlify)
2. **Backend** - Run multiple FastAPI instances behind load balancer
3. **Database** - MySQL replication for read scaling

### Vertical Scaling

1. Increase connection pool size
2. Upgrade MySQL to larger instance
3. Add Redis for caching
4. Implement query result caching

### Monitoring

```bash
# Backend logs
tail -f uvicorn.log

# Database performance
mysql -u root -p
SHOW PROCESSLIST;
SHOW STATUS;

# Frontend performance
# Check browser DevTools → Network tab
# Check Lighthouse scores
```

---

## ✅ Checklist: First-Time Setup

Use this checklist to ensure successful setup:

- [ ] MySQL is installed and running
- [ ] Database `canaan` is created
- [ ] Python 3.8+ is installed
- [ ] Python virtual environment is activated
- [ ] Backend dependencies installed (`pip install fastapi uvicorn sqlalchemy pymysql`)
- [ ] Database initialized (`python3 clear_database.py`)
- [ ] Node.js 18+ is installed
- [ ] Frontend dependencies installed (`npm install`)
- [ ] Backend server starts (`uvicorn main:app --reload`)
- [ ] Frontend server starts (`npm run dev`)
- [ ] Can access http://localhost:3000 (frontend)
- [ ] Can access http://localhost:8000/docs (API docs)

---

## 🎓 Next Steps

1. **Review the codebase** - Start with `frontend/src/types/trip.ts` to understand the data models
2. **Explore API** - Visit http://localhost:8000/docs and test endpoints
3. **Test workflows** - Try creating a trip: Create → Assign → Mark Started → Mark Completed → Close
4. **Understand animations** - Check `QUICK_REFERENCE_ANIMATIONS.md` for UI patterns
5. **Read developer guide** - Review `CLAUDE.md` for coding conventions

---

**Last Updated**: June 25, 2026  
**Version**: 1.0.0  
**Maintainer**: Canaan Global International Dev Team
