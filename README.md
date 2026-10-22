````md
# Online Bookstore

A web-based online bookstore for browsing, searching, purchasing, and tracking books. The system provides separate functionality for customers and administrators, covering catalogue management, shopping cart operations, checkout, payment processing, order management, and inventory control.

## Features

### Customer

- User registration and account management
- Secure login and authentication
- Browse the book catalogue
- Search books by title, author, category, or ISBN
- Filter and sort books by price, category, author, and availability
- View detailed book information
- Add, update, and remove items from the shopping cart
- Checkout with delivery information
- Review order details before payment
- Process online payments through the configured payment gateway
- Receive a unique Order ID after successful purchase
- View current and previous orders
- Track order status
- Cancel eligible orders

### Administrator

- Add, update, and remove books
- Manage book information and pricing
- Manage categories
- Manage inventory and stock quantities
- View and manage customer orders
- Update order statuses
- Prevent purchases when sufficient stock is unavailable

## Technology Stack

| Layer | Technology |
|---|---|
| Frontend | React.js |
| Backend | Node.js, Express.js |
| Database | MySQL |
| API | REST API |
| Payment | Payment Gateway / API |
| Communication | HTTPS / TLS |

## Architecture

The application follows a client-server architecture.

```text
Customer / Administrator
          │
          ▼
     React.js UI
          │
      REST API
          │
          ▼
 Node.js + Express.js
      │          │
      ▼          ▼
   MySQL    Payment Gateway
````

The frontend communicates with the backend through REST APIs. The backend handles authentication, catalogue operations, cart and checkout processing, orders, inventory updates, and communication with the payment service.

## Core Modules

```text
Online Bookstore
│
├── Authentication & Accounts
├── Book Catalogue & Search
├── Shopping Cart
├── Checkout & Delivery
├── Payment Processing
├── Order Management
├── Order Tracking
├── Inventory Management
└── Administrator Management
```

## Database

MySQL is used as the primary database for storing application data such as:

* Customer accounts
* Book information
* Categories
* Inventory
* Shopping carts
* Orders
* Order details
* Payment records and results
* Administrative data

The database maintains consistency between orders, payments, and inventory.

## Security

The application includes:

* Authentication for protected operations
* Role-Based Access Control (RBAC)
* Secure password hashing
* HTTPS/TLS for sensitive communication
* Session management
* Input validation
* Protection against duplicate transactions
* Restricted administrator operations
* Protection of payment-related information

Passwords are not stored in plain text, and administrative operations are restricted to authorized administrators.

## Order Flow

```text
Register / Login
      │
      ▼
Browse / Search Books
      │
      ▼
Select Book
      │
      ▼
Add to Cart
      │
      ▼
Review Cart
      │
      ▼
Enter Delivery Details
      │
      ▼
Review Order
      │
      ▼
Payment Processing
      │
      ├── Payment Failed
      │       │
      │       ▼
      │   Show Failure
      │
      ▼
Payment Verified
      │
      ▼
Create Order + Order ID
      │
      ▼
Update Inventory
      │
      ▼
Order Confirmation
      │
      ▼
Track Order
```

Failed payment or communication requests must not create duplicate orders or leave payment and inventory records inconsistent.

## API

The backend provides REST API endpoints for communication between the React frontend and application server.

The API handles operations related to:

* Authentication
* Users
* Books
* Categories
* Cart
* Checkout
* Payments
* Orders
* Inventory
* Administration

Responses received from external payment services are validated before updating payment or order status.

## Project Structure

```text
online-bookstore/
│
├── client/
│   ├── src/
│   ├── public/
│   └── package.json
│
├── server/
│   ├── routes/
│   ├── controllers/
│   ├── models/
│   ├── middleware/
│   ├── config/
│   └── package.json
│
├── database/
│   └── schema.sql
│
├── docs/
│   ├── SRS/
│   ├── SAD/
│   └── STP/
│
└── README.md
```

> The exact directory structure may vary depending on the implementation.

## Requirements

Before running the project, install:

* Node.js
* npm
* MySQL
* Git

## Installation

Clone the repository:

```bash
git clone <repository-url>
cd online-bookstore
```

### Backend

```bash
cd server
npm install
```

Configure the database and environment variables in `.env`.

Example:

```env
PORT=5000
DB_HOST=localhost
DB_USER=<your-db-user>
DB_PASSWORD=<your-db-password>
DB_NAME=<your-database-name>
```

Create the database and tables (requires MySQL 8.0.16 or newer). Add `--seed` to load sample books, categories and demo accounts:

```bash
npm run db:setup -- --seed
```

`npm run db:reset` drops and recreates the database (never allowed when `NODE_ENV=production`). The schema lives in `database/schema.sql`.

Start the backend:

```bash
npm run dev
```

Run the tests (they create and drop their own temporary databases, so the `DB_USER` in `.env` needs permission to create databases):

```bash
npm test
```

### Frontend

Open another terminal:

```bash
cd client
npm install
npm run dev
```

### Signing in during development (temporary)

Real sign-in is a separate feature (issue #1). Until it lands, checkout and the administrator inventory API need *some* signed-in user, so development can use a stand-in:

1. In `server/.env` set `ALLOW_DEV_AUTH=true` (it is `false` by default; the API then answers 401 to every protected request).
2. In `client/.env.development.local` set `VITE_DEV_USER_ID=2` (see `client/.env.example`). With the seed data, `2` is a customer with a ready cart, `3` is a customer without one, and `1` is the administrator.

The stand-in works by trusting an `X-Dev-User-Id` request header, which anyone can forge. Never enable `ALLOW_DEV_AUTH` on a deployed server.

## Environment Variables

Do not commit credentials or secrets to the repository.

```env
PORT=
DB_HOST=
DB_USER=
DB_PASSWORD=
DB_NAME=
ALLOW_DEV_AUTH=
PAYMENT_API_KEY=
PAYMENT_SECRET=
```

Use only the variables required by the actual implementation.

## Testing

Testing covers customer, administrator, payment, order, inventory, security, and non-functional requirements.

### Test Levels

* Unit Testing
* Integration Testing
* System Testing
* User Acceptance Testing (UAT)

### Test Areas

* Authentication and authorization
* Catalogue search and filtering
* Shopping cart operations
* Checkout
* Payment success and failure handling
* Duplicate payment and order prevention
* Order management
* Inventory consistency
* Administrator access
* Security controls
* Performance
* Browser compatibility
* Responsive layouts
* Recovery and failure handling

Postman can be used for API testing. Selenium and JMeter are proposed for UI automation and performance testing where required.

## Scope

### In Scope

* Customer management
* Catalogue management
* Search and filtering
* Shopping cart
* Checkout
* Payment integration
* Order management
* Order tracking
* Inventory management
* Administrator operations
* Security
* Performance, reliability, usability, maintainability, and portability requirements

### Out of Scope

* Physical warehouse operations
* Book publishing
* Physical delivery operations
* Banking infrastructure
* Internal implementation of third-party payment services
* Internal implementation of third-party courier services

## Documentation

Project documentation includes:

* Software Requirements Specification (SRS)
* Software Architecture and Design documentation (SAD)
* Software Test Plan (STP)
* Test cases and execution records
* Requirements Traceability Matrix (RTM)

## Team

**Team 16 — Online Bookstore**

| Member             | SRN           |
| ------------------ | ------------- |
| Varchas            | PES2UG24CS575 |
| Uditi Mourya       | PES2UG24CS565 |
| Vrinda Venugopal M | PES2UG24CS601 |

## Status

Version 1.0

