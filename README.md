# Folio — Online Bookstore Platform

<div align="center">

### Discover books. Explore ideas. Find your next read.

A full-stack online bookstore built with React, Node.js, Express.js, and MySQL, providing an integrated platform for book discovery, catalogue management, authentication, shopping cart operations, checkout, order tracking, and customer reviews.

[![React](https://img.shields.io/badge/React-Frontend-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![Node.js](https://img.shields.io/badge/Node.js-Backend-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![Express.js](https://img.shields.io/badge/Express.js-API-000000?logo=express&logoColor=white)](https://expressjs.com/)
[![MySQL](https://img.shields.io/badge/MySQL-Database-4479A1?logo=mysql&logoColor=white)](https://www.mysql.com/)
[![Vite](https://img.shields.io/badge/Vite-Build_Tool-646CFF?logo=vite&logoColor=white)](https://vite.dev/)

</div>

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
- [Book Discovery and Catalogue](#book-discovery-and-catalogue)
- [Checkout and Payment Processing](#checkout-and-payment-processing)
- [Security and Data Integrity](#security-and-data-integrity)
- [Testing](#testing)
- [Git Workflow](#git-workflow)
- [Troubleshooting](#troubleshooting)
- [Future Enhancements](#future-enhancements)
- [Contributing](#contributing)

## Overview

**Folio** is a full-stack online bookstore application designed to provide readers with a seamless platform for discovering books, exploring categories, accessing detailed book information, and managing purchases.

The application combines a React-based frontend with an Express.js backend and a MySQL database. It supports external book discovery, user authentication, catalogue administration, shopping cart management, checkout workflows, order tracking, and customer reviews.

Developed as a collaborative Software Engineering project, Folio follows a modular architecture that promotes maintainability, scalability, and structured development.

## Project Objectives

- Develop a responsive and intuitive online bookstore.
- Enable efficient book discovery through search and category-based browsing.
- Implement secure user authentication and account management.
- Support shopping cart and checkout workflows.
- Provide order history and order status tracking.
- Enable customers to submit and view book reviews.
- Implement administrative catalogue and inventory management.
- Maintain persistent application data using MySQL.
- Apply software engineering principles through modular development, API integration, validation, and automated testing.

## Features

### 1. Book Discovery and Catalogue

- Browse books across multiple categories and genres.
- Search for books and explore detailed information.
- Integrate external book discovery providers.
- Support fallback provider behaviour.
- Display available book covers, descriptions, authors, and other metadata.
- Provide category-based filtering and responsive catalogue layouts.
- Maintain local product records for shopping operations.

### 2. Authentication and User Management

- User registration and login.
- Session-based authentication.
- Account and profile management.
- Password-reset functionality using expiring reset tokens.
- Protected routes and authenticated operations.

### 3. Book Details and Reviews

- Dedicated book detail pages.
- Display book descriptions and available information.
- Display customer reviews and ratings.
- Allow authenticated users to submit reviews.
- Persist review information through backend APIs and database storage.

### 4. Shopping Cart

- Add books to the shopping cart.
- Update product quantities.
- Remove products from the cart.
- Display item prices and order totals.
- Validate product availability during relevant operations.

### 5. Checkout and Order Management

- Review order details before checkout.
- Support simulated prepaid checkout workflows.
- Support Cash on Delivery where configured and eligible.
- Display order confirmation.
- Maintain order history.
- Track payment and order statuses independently.
- Handle unsuccessful, cancelled, and incomplete checkout attempts.

### 6. Catalogue and Inventory Administration

- Create and update catalogue entries.
- Manage product pricing and stock availability.
- Provide administrative access controls.
- Support catalogue and inventory management through the application interface.

### 7. User Interface and Experience

- Responsive layouts for desktop, tablet, and mobile.
- Light and dark themes.
- Consistent styling across application modules.
- Category-specific catalogue presentation.
- Reusable UI components and shared design tokens.

## Technology Stack

| Layer | Technologies |
|---|---|
| Frontend | React, JavaScript, Vite |
| Styling | CSS Modules, Global CSS, Theme Tokens |
| Backend | Node.js, Express.js |
| Database | MySQL |
| Authentication | Session-based Authentication |
| External APIs | Open Library, Google Books |
| Testing | Frontend and Backend Test Suites |
| Version Control | Git, GitHub |

Dependency versions are maintained in the respective frontend and backend `package.json` files.

## System Architecture

Folio follows a client-server architecture in which the React frontend communicates with the Express.js backend through HTTP/REST APIs.

The backend handles authentication, request validation, business logic, database operations, and external API integration.

```text
                       USER / ADMIN
                            |
                            |
                            v
                  +---------------------+
                  |    React + Vite     |
                  |                     |
                  |  Book Catalogue     |
                  |  Authentication     |
                  |  Shopping Cart      |
                  |  Checkout           |
                  |  Orders             |
                  |  Reviews            |
                  |  Administration     |
                  +----------+----------+
                             |
                         HTTP / REST
                             |
                             v
                  +---------------------+
                  |     Express.js      |
                  |                     |
                  |  Authentication     |
                  |  Catalogue APIs     |
                  |  Cart and Orders    |
                  |  Payment Workflows  |
                  |  Review Management  |
                  |  Admin Operations   |
                  +----------+----------+
                             |
                +------------+------------+
                |                         |
                v                         v
        +---------------+       +------------------+
        |    MySQL      |       | External Book APIs|
        |               |       |                  |
        | Users         |       | Open Library     |
        | Sessions      |       | Google Books     |
        | Books         |       +------------------+
        | Orders        |
        | Reviews       |
        | Inventory     |
        +---------------+
```

## Project Structure

The repository is organized into separate frontend and backend applications.

```text
Online-Bookstore-Platform/
│
├── frontend/
│   ├── public/
│   │   ├── backgrounds/
│   │   └── categories/
│   │
│   ├── scripts/
│   │
│   ├── src/
│   │   ├── app/
│   │   │   └── router.jsx
│   │   │
│   │   ├── components/
│   │   │   └── shared/
│   │   │
│   │   ├── features/
│   │   │   ├── uditi/
│   │   │   │   ├── catalogue/
│   │   │   │   ├── checkout/
│   │   │   │   └── inventory/
│   │   │   │
│   │   │   ├── varchas/
│   │   │   │   ├── admin-catalogue/
│   │   │   │   ├── authentication/
│   │   │   │   ├── book-details/
│   │   │   │   └── payments/
│   │   │   │
│   │   │   └── vrinda/
│   │   │       ├── cart/
│   │   │       ├── orders/
│   │   │       └── registration-profile/
│   │   │
│   │   ├── pages/
│   │   └── styles/
│   │
│   ├── index.html
│   └── package.json
│
├── backend/
│   ├── database/
│   │   ├── migrations/
│   │   ├── schema.sql
│   │   └── README.md
│   │
│   ├── src/
│   │   ├── features/
│   │   │   ├── uditi/
│   │   │   ├── varchas/
│   │   │   └── vrinda/
│   │   │
│   │   └── server.js
│   │
│   ├── test/
│   ├── .env.example
│   └── package.json
│
├── README.md
└── .gitignore
```

*Note: This represents the primary repository structure. Individual files and directories may vary with the current implementation.*

## Getting Started

### Prerequisites

Install the following software before setting up the project:

- [Node.js](https://nodejs.org/)
- npm (included with Node.js)
- [MySQL Community Server](https://dev.mysql.com/downloads/mysql/)
- [Git](https://git-scm.com/)
- [Visual Studio Code](https://code.visualstudio.com/) or another code editor.

MySQL Workbench is optional and can be used for database inspection and administration.

### 1. Clone the Repository

```bash
git clone <YOUR_GITHUB_REPOSITORY_URL>
cd Online-Bookstore-Platform
```

Replace the placeholder with the actual GitHub repository URL.

### 2. Install Frontend Dependencies

```bash
cd frontend
npm install
```

### 3. Install Backend Dependencies

Open another terminal and navigate to the backend directory:

```bash
cd backend
npm install
```

### 4. Configure Environment Variables

Create a local environment file using the provided example.

**Windows PowerShell:**

```powershell
Copy-Item .env.example .env
```

**Linux/macOS:**

```bash
cp .env.example .env
```

Update `backend/.env` with your local database credentials and required configuration.

Never commit `.env` files or expose private credentials.

### 5. Configure the Database

- Start the MySQL server.
- Create the development database.
- Configure the database credentials in `backend/.env`.
- Execute the database schema.
- Apply the required migrations.

Refer to the [Database Setup](#database-setup) section for additional information.

### 6. Start the Application

Run the frontend and backend independently using their respective npm scripts.

Typical development URLs:

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:5000`

Verify the configured ports in the project before starting the services.

## Environment Configuration

The backend uses environment variables for database connectivity, session management, and application configuration.

| Variable | Purpose |
|---|---|
| `PORT` | Backend server port |
| `SESSION_SECRET` | Session-signing secret |
| `DB_HOST` | MySQL host |
| `DB_PORT` | MySQL port |
| `DB_NAME` | Database name |
| `DB_USER` | Database username |
| `DB_PASSWORD` | Database password |
| `DEV_PASSWORD_RESET_LINK` | Development password-reset link configuration |
| `VARCHAS_ADAPTER_MODULE` | Optional backend adapter module |
| `PAYMENT_PROVIDER` | Payment provider configuration, where supported |
| `FOLIO_CHECKOUT_OUTCOME` | Simulated checkout outcome configuration, where enabled |

The authoritative environment configuration is maintained in `backend/.env.example` and the backend configuration code.

### Security Guidelines

- Never commit environment files or private credentials.
- Keep `.env.example` restricted to safe placeholder values.
- Use strong session secrets.
- Do not expose database credentials in frontend code.
- Disable development-only password-reset functionality in production.
- Do not use simulated payment configuration as a replacement for a production payment gateway.

## Database Setup

Folio uses MySQL for persistent application data.

### Initialize the Database

1. Start the local MySQL server.
2. Create the database specified in `backend/.env`.
3. Inspect `backend/database/schema.sql`.
4. Execute the required SQL migrations from `backend/database/migrations/`.
5. Verify the database connection using the configured credentials.

Database documentation:

- `backend/database/README.md`
- `backend/database/migrations/README.md`

### Database Migrations

The repository contains migrations for features such as password-reset tokens and Cash on Delivery order support.

Apply migrations according to the documented migration procedure.

Avoid repeatedly executing non-idempotent migrations or manually modifying important database records.

**Important:** Back up existing data before performing schema modifications. Do not reset an existing database unless you intentionally want to remove its contents.

## Running the Application

The frontend and backend operate independently during development.

### Backend

Navigate to the backend directory and inspect the available scripts:

```bash
npm run
```

If a development script is configured:

```bash
npm run dev
```

### Frontend

Navigate to the frontend directory:

```bash
npm run dev
```

### Production Build

From the frontend directory:

```bash
npm run build
```

After starting both applications, verify that the frontend communicates successfully with the backend API and that the backend can access the MySQL database.

## Application Modules

| Module | Description |
|---|---|
| Authentication | User registration, login, sessions, and password-reset workflows |
| Catalogue | Book discovery, search, category filtering, and external API integration |
| Book Details | Detailed book information and customer reviews |
| Shopping Cart | Product selection, quantity management, and cart totals |
| Checkout | Checkout validation and payment-method workflows |
| Payments | Simulated payment outcomes and payment-status management |
| Orders | Order history and order-status tracking |
| Inventory | Stock visibility and inventory management |
| Admin Catalogue | Administrative catalogue creation, updates, and pricing |
| Reviews | Customer ratings and review submission |

## Book Discovery and Catalogue

Folio integrates external book discovery providers, including **Open Library** and **Google Books** fallback functionality.

External APIs may return incomplete information, including missing cover images, descriptions, ISBNs, or subject classifications.

The application handles these scenarios through:

- Normalization of external book data.
- Handling of missing metadata.
- Deduplication of overlapping search results.
- Fallback provider integration where configured.
- Stable local product identifiers.
- Database-managed pricing and inventory.

External discovery records and locally managed products may have different capabilities.

Shopping cart and checkout operations must use valid local product records, with prices and availability validated by the backend.

## Checkout and Payment Processing

Folio provides an integrated checkout experience with configurable payment workflows.

Depending on the active configuration, payment interfaces may include:

- Card payments.
- UPI payments.
- Net banking.
- Cash on Delivery (COD).

### Simulated Payment Processing

The configured prepaid checkout workflow supports simulated outcomes such as:

- Approved.
- Declined.
- Cancelled.
- Timed out.

These outcomes are used to exercise checkout, payment-status, and order-management workflows.

A simulated payment does not transfer money or represent a transaction processed by a live payment gateway.

A production payment integration would require:

- A configured payment provider.
- Server-side transaction verification.
- Secure webhook handling.
- Payment-status reconciliation.

### Cash on Delivery

Cash on Delivery follows a different payment lifecycle from prepaid orders.

A COD order must not be marked as paid before the applicable payment collection and confirmation process.

Order fulfilment status and payment status must be maintained independently.

## Security and Data Integrity

Folio incorporates server-side validation and access controls across its primary application workflows.

Key security considerations include:

- Session-based authentication.
- Protected administrative operations.
- Server-side request validation.
- Database-backed persistence.
- Expiring and single-use password-reset tokens.
- Validation of product identifiers, prices, stock, and order data.
- Separation of development configuration from committed example files.

For production deployment, additional security measures should be reviewed, including:

- HTTPS and secure session-cookie settings.
- CSRF protection where applicable.
- Session expiration and invalidation.
- Rate limiting.
- Database access restrictions.
- Secure secret management.
- Application logging and monitoring.
- Payment-provider verification and webhook security.

## Testing

The repository includes frontend and backend test suites.

Inspect the available test scripts from the respective application directories:

```bash
npm run
```

Run the configured test command. A common command is:

```bash
npm test
```

### Frontend Production Build

```bash
cd frontend
npm run build
```

### Recommended Testing Areas

- Authentication and session management.
- Password-reset validation and token expiration.
- Catalogue provider fallback.
- External book data normalization.
- Search and category filtering.
- Shopping cart operations.
- Order creation and validation.
- Payment outcome handling.
- Cash on Delivery status management.
- Database schema and migrations.
- Frontend component behaviour.

Database integration tests may require a separately configured MySQL test database.

Never execute destructive tests against databases containing important development or production data.

## Git Workflow

The project uses Git and GitHub for version control and collaborative development.

Use feature branches to organize development work.

```bash
git switch -c feature/your-feature
git status
git add <reviewed-files>
git diff --cached
git commit -m "Describe the change"
git push -u origin feature/your-feature
```

After pushing the branch, create a pull request on GitHub for review.

### Before Committing

- Review staged changes.
- Exclude `.env` files and private credentials.
- Run relevant tests and builds.
- Review database migrations.
- Avoid force-pushing shared branches without team approval.
- Use meaningful commit messages.

## Troubleshooting

| Issue | Recommended Checks |
|---|---|
| Frontend cannot connect to backend | Verify backend status, API configuration, and CORS settings. |
| Database connection fails | Check MySQL service, host, port, database name, and credentials. |
| Login or session persistence fails | Review session configuration, cookie settings, and frontend credential handling. |
| Catalogue returns no results | Check provider availability, search terms, category mapping, and filtering logic. |
| Book covers do not load | Inspect image URLs, provider metadata, and fallback handling. |
| Checkout fails | Check backend validation, configured checkout outcomes, stock, and order persistence. |
| COD order is incorrectly marked as paid | Verify payment-status transitions and database migrations. |
| Password reset fails | Check migration status, token expiration, and reset-link configuration. |
| Frontend build fails | Review dependencies, syntax errors, and build output. |
| Database integration tests fail | Verify test database configuration and migration status. |

## Future Enhancements

Potential improvements for future development include:

- Integration with a production payment provider.
- Secure payment verification and webhook processing.
- Email-based password recovery.
- Automated order notifications.
- Personalized book recommendations.
- Improved search relevance and catalogue ranking.
- Enhanced order fulfilment and shipment tracking.
- Expanded accessibility and end-to-end testing.
- Performance monitoring and deployment automation.

These are proposed enhancements and are not necessarily implemented in the current version.

## Contributing

Contributions should follow the repository's existing architecture and development conventions.

1. Create a feature branch.
2. Implement focused and modular changes.
3. Add or update relevant tests.
4. Run the appropriate test suites.
5. Verify the production build.
6. Review the staged changes.
7. Push the branch and create a pull request.

Maintain consistent coding standards, document database migrations, and avoid committing sensitive information or generated files.

---

<div align="center">

### Folio

**A better way to discover your next read.**

</div>
