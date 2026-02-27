# restaurant-deals-api (Backend)

## Overview
Node + Express + TypeScript REST API for Restaurant Deals.

## Tech Stack
- Node.js, Express, TypeScript
- MongoDB + Mongoose
- JWT Authentication

## Running locally
```bash
npm install
npm run dev
```

Build check:
```bash
npm run build
```

## Environment variables
Create a `.env` file:
- API_PORT=3000
- MONGO_URI=
- JWT_SECRET=

Example values are in `.env.example`.

## API endpoints (current)
- `GET /api/health`
- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `GET /api/deals`
- `GET /api/deals/:id`
- `POST /api/owner/deals`
- `PUT /api/owner/deals/:id`
- `DELETE /api/owner/deals/:id`
- `POST /api/owner/deals/:id/submit`
- `GET /api/owner/deals`
- `GET /api/admin/deals/submitted`
- `POST /api/admin/deals/:id/approve`
- `POST /api/admin/deals/:id/reject`
- `GET /api/favorites`
- `POST /api/favorites/:dealId`
- `DELETE /api/favorites/:dealId`
