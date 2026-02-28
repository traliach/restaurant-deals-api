# Restaurant Deals API

REST API for a moderated restaurant deals marketplace. Restaurant owners create deals as drafts, submit them for review, and admins approve or reject them before they go public.

## Features

- JWT authentication with role-based access (customer, owner, admin)
- Deal lifecycle workflow: DRAFT → SUBMITTED → PUBLISHED / REJECTED
- Public deals feed with search, filters, sorting, and pagination
- Favorites system with duplicate prevention (compound unique index)
- Mongoose schemas with validation and query-optimized indexes

## Tech Stack

- Node.js + Express + TypeScript
- MongoDB Atlas + Mongoose
- JSON Web Tokens (JWT) + bcrypt

## Getting Started

```bash
git clone <repo-url>
cd restaurant-deals-api
npm install
cp .env.example .env   # fill in your values
npm run dev
```

## Scripts

| Script        | Description                  |
|---------------|------------------------------|
| `npm run dev` | Start dev server (ts-node)   |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start`   | Run compiled JS from `dist/` |

## Environment Variables

| Variable     | Description                     | Example                          |
|--------------|---------------------------------|----------------------------------|
| `API_PORT`   | Port the server listens on      | `3000`                           |
| `MONGO_URI`  | MongoDB Atlas connection string | `mongodb+srv://user:pass@cluster/db` |
| `JWT_SECRET` | Secret key for signing tokens   | Any long random string           |

Copy `.env.example` to `.env` and fill in your values. Never commit `.env`.

## API Endpoints

### Auth
| Method | Route                | Access  | Description            |
|--------|----------------------|---------|------------------------|
| POST   | `/api/auth/register` | Public  | Create account         |
| POST   | `/api/auth/login`    | Public  | Login, returns JWT     |
| GET    | `/api/auth/me`       | Auth    | Get current user       |

### Public Deals
| Method | Route             | Access | Description                          |
|--------|-------------------|--------|--------------------------------------|
| GET    | `/api/deals`      | Public | List published deals (search/filter/paginate) |
| GET    | `/api/deals/:id`  | Public | Single published deal                |

Query params for `GET /api/deals`: `q`, `dealType`, `minPrice`, `maxPrice`, `minValue`, `maxValue`, `sort` (newest/value), `page`, `limit`.

### Owner Deals
| Method | Route                         | Access | Description               |
|--------|-------------------------------|--------|---------------------------|
| POST   | `/api/owner/deals`            | Owner  | Create draft deal         |
| GET    | `/api/owner/deals`            | Owner  | List own deals            |
| PUT    | `/api/owner/deals/:id`        | Owner  | Edit draft/rejected deal  |
| DELETE | `/api/owner/deals/:id`        | Owner  | Delete draft              |
| POST   | `/api/owner/deals/:id/submit` | Owner  | Submit for review         |

### Admin Moderation
| Method | Route                           | Access | Description        |
|--------|---------------------------------|--------|--------------------|
| GET    | `/api/admin/deals/submitted`    | Admin  | List submitted deals |
| POST   | `/api/admin/deals/:id/approve`  | Admin  | Publish deal       |
| POST   | `/api/admin/deals/:id/reject`   | Admin  | Reject with reason |

### Favorites
| Method | Route                     | Access | Description      |
|--------|---------------------------|--------|------------------|
| GET    | `/api/favorites`          | Auth   | List favorites   |
| POST   | `/api/favorites/:dealId`  | Auth   | Add favorite     |
| DELETE | `/api/favorites/:dealId`  | Auth   | Remove favorite  |

## Project Structure

```
src/
  app.ts              Express app setup
  server.ts           Entry point
  config/env.ts       Environment config
  db/connect.ts       MongoDB connection
  models/
    Deal.ts           Deal schema + indexes
    User.ts           User schema + role validation
    Favorite.ts       Favorite schema + unique index
  routes/
    auth.ts           Register / login / me
    deals.public.ts   Public deal feed
    deals.owner.ts    Owner CRUD + submit
    deals.admin.ts    Admin approve / reject
    favorites.ts      Favorite CRUD
  middleware/
    requireAuth.ts    JWT verification
    requireRole.ts    Role-based access
    errorHandler.ts   Global error catch
```

## Related

- Frontend repo: [restaurant-deals-web](https://github.com/traliach/restaurant-deals-web)
