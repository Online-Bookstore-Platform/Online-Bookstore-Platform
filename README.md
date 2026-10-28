# Folio — Online Bookstore Platform

<p align="center">
  <strong>Discover books. Explore ideas. Find your next read.</strong>
</p>

<p align="center">
  A full-stack online bookstore built with React, Express.js, and MySQL, featuring book discovery, user authentication, shopping cart management, checkout, order tracking, reviews, and catalogue administration.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/React-Frontend-61DAFB?logo=react&logoColor=black" alt="React" />
  <img src="https://img.shields.io/badge/Node.js-Backend-339933?logo=nodedotjs&logoColor=white" alt="Node.js" />
  <img src="https://img.shields.io/badge/Express.js-API-000000?logo=express&logoColor=white" alt="Express.js" />
  <img src="https://img.shields.io/badge/MySQL-Database-4479A1?logo=mysql&logoColor=white" alt="MySQL" />
  <img src="https://img.shields.io/badge/Vite-Build%20Tool-646CFF?logo=vite&logoColor=white" alt="Vite" />
</p>

---

## Table of Contents

- [Overview](#overview)
- [Project Objectives](#project-objectives)
- [Features](#features)
- [Technology Stack](#technology-stack)
- [System Architecture](#system-architecture)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Environment Configuration](#environment-configuration)
- [Database Setup](#database-setup)
- [Running the Application](#running-the-application)
- [Application Modules](#application-modules)
- [Catalogue and Book Discovery](#catalogue-and-book-discovery)
- [Checkout and Payment Processing](#checkout-and-payment-processing)
- [Security and Data Integrity](#security-and-data-integrity)
- [Testing](#testing)
- [Git Workflow](#git-workflow)
- [Troubleshooting](#troubleshooting)
- [Future Enhancements](#future-enhancements)
- [Contributing](#contributing)
- [License](#license)

## Overview

**Folio** is a full-stack online bookstore application designed to provide readers with a convenient way to discover books, explore categories, review book information, and manage purchases through an integrated shopping experience.

The platform combines an interactive React frontend with an Express.js backend and a MySQL database. It supports external book discovery, persistent application data, authenticated user workflows, catalogue administration, simulated checkout, and order management.

Folio is developed as a collaborative software engineering project, with modular features designed to support maintainability, testing, and future extension.

## Project Objectives

- Build a responsive and user-friendly online bookstore.
- Provide book discovery across multiple genres and subject areas.
- Implement secure user authentication and account management.
- Support shopping cart, checkout, and order lifecycle workflows.
- Provide customer reviews and book detail pages.
- Enable administrative catalogue and inventory management.
- Maintain persistent data using MySQL.
- Demonstrate modular backend architecture, API integration, validation, and automated testing.

## Features

### Book Discovery and Catalogue

- Browse books across multiple categories and genres.
- Search for books and explore their details.
- Integrate external book discovery providers.
- Support fallback provider behaviour when available.
- Display book covers, descriptions, authors, prices, and availability where data is available.
- Provide category filtering and responsive catalogue layouts.
- Maintain local product records for supported shopping workflows.

### Authentication and User Accounts

- User registration and login.
- Session-based authentication.
- Account and profile management.
- Password-reset workflow with expiring reset tokens.
- Protected routes and authenticated operations.

### Book Details and Reviews

- Dedicated book detail pages.
- Display book information and available reviews.
- Support review ratings and review submission for authenticated users.
- Persist reviews through backend APIs and database storage.

### Shopping Cart

- Add books to the cart.
- Update quantities and remove items.
- Display item prices and order totals.
- Validate product availability during relevant operations.

### Checkout and Orders

- Review order details before placing an order.
- Support simulated prepaid payment workflows.
- Support Cash on Delivery where configured and eligible.
- Display order confirmation and order history.
- Track order and payment statuses separately.
- Provide appropriate handling for failed, cancelled, or incomplete checkout attempts.

### Catalogue Administration

- Create and update catalogue entries.
- Manage product pricing and inventory.
- Use administrative authorization for protected management operations.
- Support catalogue and inventory workflows through the application interface.

### User Interface

- Responsive layouts for desktop, tablet, and mobile.
- Light and dark themes.
- Category-specific catalogue backgrounds and shared design tokens.
- Book cards, navigation, forms, and checkout components.
- Consistent visual styling across major application pages.

## Technology Stack

| Layer | Technologies |
|---|---|
| Frontend | React, JavaScript, Vite |
| Styling | CSS Modules, global CSS, theme tokens |
| Backend | Node.js, Express.js |
| Database | MySQL |
| Authentication | Session-based authentication |
| API integration | Open Library, Google Books fallback |
| Testing | Project-specific frontend and backend test suites |
| Version control | Git and GitHub |

The exact dependencies and versions are defined in the project's `package.json` files.

## System Architecture

Folio follows a client-server architecture.

```text
                         ┌─────────────────────────┐
                         │       User / Admin      │
                         └────────────┬────────────┘
                                      │
                                      ▼
                         ┌─────────────────────────┐
                         │    React + Vite UI      │
                         │                         │
                         │ Catalogue, Cart, Auth,  │
                         │ Checkout, Orders, Admin │
                         └────────────┬────────────┘
                                      │ HTTP / REST
                                      ▼
                         ┌─────────────────────────┐
                         │      Express.js API     │
                         │                         │
                         │ Authentication          │
                         │ Catalogue               │
                         │ Payments and Orders     │
                         │ Reviews and Admin       │
                         └─────────┬───────────────┘
                                   │
                    ┌──────────────┴──────────────┐
                    ▼                             ▼
         ┌────────────────────┐      ┌────────────────────┐
         │     MySQL DB       │      │ External Book APIs │
         │                    │      │                    │
         │ Users, Books,      │      │ Open Library       │
         │ Sessions, Orders,  │      │ Google Books       │
         │ Reviews, Inventory │      │ Fallback provider  │
         └────────────────────┘      └────────────────────┘
```

The frontend communicates with the backend through HTTP APIs. The backend handles validation, authentication, business logic, persistence, and integration with external book providers.

## Project Structure

The repository is organized into frontend and backend applications.

```text
Online-Bookstore-Platform/
├── frontend/
│   ├── public/
│   │   ├── backgrounds/
│   │   └── categories/
│   ├── scripts/
│   ├── src/
│   │   ├── app/
│   │   │   └── router.jsx
│   │   ├── components/
│   │   │   └── shared/
│   │   ├── features/
│   │   │   ├── uditi/
│   │   │   │   ├── catalogue/
│   │   │   │   ├── checkout/
│   │   │   │   └── inventory/
│   │   │   ├── varchas/
│   │   │   │   ├── admin-catalogue/
│   │   │   │   ├── authentication/
│   │   │   │   ├── book-details/
│   │   │   │   └── payments/
│   │   │   └── vrinda/
│   │   │       ├── cart/
│   │   │       ├── orders/
│   │   │       └── registration-profile/
│   │   ├── pages/
│   │   └── styles/
│   ├── index.html
│   └── package.json
│
├── backend/
│   ├── database/
│   │   ├── migrations/
│   │   ├── schema.sql
│   │   └── README.md
│   ├── src/
│   │   ├── features/
│   │   │   ├── uditi/
│   │   │   ├── varchas/
│   │   │   └── vrinda/
│   │   └── server.js
│   ├── test/
│   ├── .env.example
│   └── package.json
│
├── README.md
└── .gitignore
```

*This is a representative structure. Some directories or files may vary with the current implementation.*

## Getting Started

### Prerequisites

Install the following software before running Folio:

- [Node.js](https://nodejs.org/) — use a version compatible with the project dependencies.
- npm, included with Node.js.
- [MySQL Community Server](https://dev.mysql.com/downloads/mysql/).
- [Git](https://git-scm.com/).
- A code editor such as Visual Studio Code.

Optional: MySQL Workbench for database inspection and administration.

### 1. Clone the repository

```bash
git clone <YOUR_GITHUB_REPOSITORY_URL>
cd Online-Bookstore-Platform
```

Replace the placeholder with your repository's actual GitHub URL.

### 2. Install frontend dependencies

```bash
cd frontend
npm install
```

### 3. Install backend dependencies

Open another terminal or return to the repository root:

```bash
cd backend
npm install
```

### 4. Configure environment variables

Create a local environment file based on the backend example:

```powershell
Copy-Item .env.example .env
```

Run that command from the `backend` directory in PowerShell.

Edit `backend/.env` with your local configuration. Never commit this file to Git.

### 5. Configure the database

Create the development database, configure the connection settings, and apply the schema and required migrations. See [Database Setup](#database-setup).

### 6. Start the application

Start the backend and frontend in separate terminals using the scripts defined in their respective `package.json` files.

The local development URLs are typically:

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:5000`

Confirm the actual ports in the project configuration.

## Environment Configuration

The backend uses environment variables for local configuration.

Common configuration keys include:

| Variable | Purpose |
|---|---|
| `PORT` | Backend server port |
| `SESSION_SECRET` | Session-signing secret |
| `DB_HOST` | MySQL host |
| `DB_PORT` | MySQL port |
| `DB_NAME` | Database name |
| `DB_USER` | Database username |
| `DB_PASSWORD` | Database password |
| `DEV_PASSWORD_RESET_LINK` | Enables the explicitly configured development password-reset link behaviour |
| `VARCHAS_ADAPTER_MODULE` | Optional module for custom backend adapters |
| `PAYMENT_PROVIDER` | Payment provider configuration, if supported by the active implementation |
| `FOLIO_CHECKOUT_OUTCOME` | Configured simulated checkout outcome, if enabled by the active implementation |

The exact variables required depend on the current backend configuration. Refer to `backend/.env.example` and the backend configuration code for the authoritative list.

**Security guidelines:**

- Never commit `.env` files or real credentials.
- Keep `.env.example` limited to safe placeholder values.
- Use strong session secrets outside development.
- Do not expose database credentials or private API keys in frontend code.
- Disable development-only reset-link behaviour in production.
- Never use simulated payment configuration as a substitute for a real payment provider in a production commerce deployment.

## Database Setup

Folio uses MySQL for persistent application data.

### Initialize the database

1. Start your local MySQL server.
2. Create the database configured in `backend/.env`.
3. Inspect `backend/database/schema.sql`.
4. Apply the required SQL migrations from `backend/database/migrations/`.
5. Verify that the application can connect using the configured database credentials.

Consult the database documentation:

- `backend/database/README.md`
- `backend/database/migrations/README.md`

### Migrations

The repository contains migrations for features such as password-reset tokens and Cash on Delivery order support.

Apply migrations according to the project's documented migration procedure. Avoid repeatedly applying non-idempotent migrations or manually modifying production data.

**Important:** Do not drop or reset an existing database just to initialize the project unless you intentionally want to lose its data. Back up data before making schema changes.

## Running the Application

The frontend and backend run independently during development.

### Backend

From the `backend` directory, use the development script defined in `backend/package.json`. A typical setup may use:

```bash
npm run dev
```

If the project does not define that script, use the available script listed by:

```bash
npm run
```

### Frontend

From the `frontend` directory, use:

```bash
npm run dev
```

For a production build:

```bash
npm run build
```

Start both applications and verify that the frontend can reach the backend API using the configured development settings.

## Application Modules

### Authentication

Handles registration, login, session management, protected operations, and password-reset workflows.

### Catalogue

Provides book discovery, search, category filtering, book information, and integration with external book providers.

### Book Details

Displays information about selected books and their available reviews.

### Cart

Manages selected products and quantities before checkout.

### Checkout and Payments

Handles checkout input, payment method selection, simulated payment outcomes, order creation, and checkout status.

### Orders

Provides order history and order status information. Payment status and fulfilment status should remain distinct.

### Inventory

Supports inventory visibility and management, including stock-related workflows.

### Admin Catalogue

Provides administrative catalogue creation and updates, with access controlled by backend authorization.

### Reviews

Supports ratings and review submission for authenticated users, subject to backend validation and configured data rules.

## Catalogue and Book Discovery

Folio integrates external book discovery sources, including Open Library and Google Books fallback behaviour.

External provider data may vary in completeness. Some books may have missing covers, descriptions, ISBNs, or subject classifications.

The application should handle these cases gracefully by:

- Normalizing book data from different providers.
- Deduplicating overlapping results.
- Handling missing metadata.
- Falling back to another provider when appropriate.
- Maintaining stable local product identifiers for shopping operations.
- Keeping local prices and inventory consistent with the application's database.

External discovery results and locally managed products may have different capabilities. Shopping operations must use valid local product records and server-validated prices and availability.

## Checkout and Payment Processing

Folio includes checkout workflows designed to demonstrate an integrated ecommerce experience.

Depending on the active configuration, supported payment options may include:

- Card-style simulated checkout.
- UPI-style simulated checkout.
- Net banking-style simulated checkout.
- Cash on Delivery.

### Simulated payments

The configured simulated payment flow can represent outcomes such as approved, declined, cancelled, or timed-out checkout attempts.

These outcomes are for application workflow testing. **They do not establish that money has been transferred or that a real payment gateway has processed a transaction.**

A real payment integration requires an appropriately configured provider, server-side verification, secure webhook handling, and reconciliation of payment status.

### Cash on Delivery

Cash on Delivery follows a different payment lifecycle from prepaid orders. An order placed with COD must not be treated as prepaid or marked paid before the applicable collection and confirmation process.

Order status and payment status should be tracked independently.

## Security and Data Integrity

Folio is designed around server-side validation and controlled access to application operations.

Important safeguards include:

- Session-based authentication.
- Protected administrative operations.
- Server-side request validation.
- Database-backed persistence.
- Password-reset tokens with expiration and single-use handling.
- Validation of product identifiers, prices, stock, and order data.
- Separation of development configuration from committed example configuration.

These safeguards should be verified against the current implementation before deployment.

For production use, additionally review HTTPS, secure cookie settings, CSRF protection where applicable, session expiry and invalidation, rate limiting, database permissions, secret management, logging, and payment-provider security requirements.

## Testing

The repository includes frontend and backend tests.

From each application directory, inspect the available scripts:

```bash
npm run
```

Run the test commands defined in the relevant `package.json` files. Common script names may include:

```bash
npm test
```

Build the frontend before deployment:

```bash
cd frontend
npm run build
```

Relevant testing areas include:

- Authentication and session handling.
- Password-reset validation and expiration.
- Catalogue provider fallback and data normalization.
- Category filtering.
- Cart and order validation.
- Payment outcome handling.
- Cash on Delivery status handling.
- Database schema and migration expectations.
- Frontend rendering and component behaviour.

Some database integration tests may require a configured MySQL test database. Configure the test environment separately and never run destructive integration tests against important development or production data.

## Git Workflow

Use feature branches for development and submit changes through pull requests.

```bash
git switch -c feature/your-feature
git status
git add <reviewed-files>
git diff --cached
git commit -m "Describe the change"
git push -u origin feature/your-feature
```

Open a pull request on GitHub after pushing the branch.

Before committing:

- Review staged changes.
- Exclude `.env` files, credentials, and generated dependencies.
- Run relevant tests and builds.
- Review database migrations.
- Avoid force-pushing shared branches without an explicit team decision.

## Troubleshooting

| Issue | What to check |
|---|---|
| Frontend cannot reach the backend | Confirm backend status, API configuration, and CORS settings. |
| Database connection fails | Check MySQL service, database name, credentials, and port. |
| Login or session persistence fails | Review session configuration, cookie settings, and frontend API credentials handling. |
| Catalogue returns no results | Check provider availability, category mapping, search terms, and filtering logic. |
| Book covers do not load | Check image URLs, provider metadata, fallback handling, and browser network errors. |
| Checkout fails | Inspect backend validation, configured simulated outcomes, stock, and order persistence. |
| COD order is incorrectly marked paid | Verify payment and fulfilment status transitions and the relevant database migration. |
| Password reset does not work | Check migration status, token expiration, development configuration, and email/reset-link behaviour. |
| Frontend build fails | Check dependency installation, syntax errors, and build output. |
| Database integration tests fail | Confirm the test database and required migrations are configured correctly. |

## Future Enhancements

Potential improvements include:

- Integration with a real payment provider and secure webhook verification.
- Email-based password recovery and order notifications.
- Advanced recommendations and personalized book discovery.
- Improved catalogue ranking and search relevance.
- Enhanced order fulfilment and tracking.
- Additional accessibility testing.
- Performance monitoring and production deployment automation.
- Expanded integration and end-to-end testing.

These are potential future enhancements and are not necessarily implemented in the current version.

## Contributing

Contributions should follow the repository's established architecture and team workflow.

1. Create a feature branch.
2. Make focused changes.
3. Add or update relevant tests.
4. Run the appropriate test suites and production build.
5. Review the staged diff.
6. Push the branch and open a pull request.

Keep changes modular, document database migrations, and avoid committing secrets or generated files.



<p align="center">
  <strong>Folio — A better way to discover your next read.</strong>
</p>
