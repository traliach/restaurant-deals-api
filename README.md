# Restaurant Deals API

REST API for a moderated restaurant deals marketplace. Restaurant owners create deals as drafts, submit them for review, and admins approve or reject them before they go public.

## Features

- JWT authentication with role-based access (customer, owner, admin)
- Deal lifecycle workflow: DRAFT → SUBMITTED → PUBLISHED / REJECTED
- Public deals feed with search, city filter, source filter, sorting, and pagination
- Favorites system with duplicate prevention (compound unique index)
- Mongoose schemas with validation and query-optimized indexes
- Restaurant profiles (owner-managed, Yelp-enrichable)
- Orders with immutable OrderItem snapshots (price locked at purchase)
- Stripe payment intents + webhook for order confirmation
- Notifications (deal approved/rejected, order status changes)
- AI bot chat (Groq) — translates natural language into deal filters with admin audit log
- Yelp Fusion API proxy for real restaurant discovery and enrichment

## Tech Stack

- Node.js + Express + TypeScript
- MongoDB Atlas + Mongoose
- JSON Web Tokens (JWT) + bcrypt
- Stripe, Yelp Fusion API, Groq API

## Getting Started

```bash
git clone https://github.com/traliach/restaurant-deals-api
cd restaurant-deals-api
npm install
cp .env.example .env   # fill in your values
npm run dev
```

## Scripts

| Script                            | Description                          |
|-----------------------------------|--------------------------------------|
| `npm run dev`                     | Start dev server (ts-node)           |
| `npm run build`                   | Compile TypeScript to `dist/`        |
| `npm start`                       | Run compiled JS from `dist/`         |
| `npx ts-node src/scripts/seed.ts` | Seed demo data (150 deals)           |
| `npx ts-node src/scripts/enrich-yelp.ts` | Import real Yelp restaurants  |

## Environment Variables

| Variable                | Description                              | Required          |
|-------------------------|------------------------------------------|-------------------|
| `API_PORT`              | Port the server listens on               | No (default 3000) |
| `MONGO_URI`             | MongoDB Atlas connection string          | Yes               |
| `JWT_SECRET`            | Secret key for signing JWTs              | Yes               |
| `STRIPE_SECRET_KEY`     | Stripe secret key (`sk_test_...`)        | For payments      |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret            | For webhooks      |
| `YELP_API_KEY`          | Yelp Fusion API key                      | For restaurant discovery |
| `GROQ_API_KEY`          | Groq API key                             | For AI bot chat   |

Copy `.env.example` to `.env` and fill in your values. Never commit `.env`.

## API Endpoints

### Auth
| Method | Route                | Access  | Description            |
|--------|----------------------|---------|------------------------|
| POST   | `/api/auth/register` | Public  | Create account         |
| POST   | `/api/auth/login`    | Public  | Login, returns JWT     |
| GET    | `/api/auth/me`       | Auth    | Get current user       |

### Public Deals
| Method | Route             | Access | Description                                   |
|--------|-------------------|--------|-----------------------------------------------|
| GET    | `/api/deals`      | Public | List published deals (search/filter/paginate) |
| GET    | `/api/deals/:id`  | Public | Single published deal                         |

Query params for `GET /api/deals`: `q`, `dealType`, `city`, `source` (seed/yelp), `minPrice`, `maxPrice`, `minValue`, `maxValue`, `sort` (newest/value), `page`, `limit`.

### Owner Deals
| Method | Route                         | Access | Description               |
|--------|-------------------------------|--------|---------------------------|
| POST   | `/api/owner/deals`            | Owner  | Create draft deal         |
| GET    | `/api/owner/deals`            | Owner  | List own deals            |
| PUT    | `/api/owner/deals/:id`        | Owner  | Edit draft/rejected deal  |
| DELETE | `/api/owner/deals/:id`        | Owner  | Delete draft              |
| POST   | `/api/owner/deals/:id/submit` | Owner  | Submit for review         |

### Admin Moderation
| Method | Route                           | Access | Description          |
|--------|---------------------------------|--------|----------------------|
| GET    | `/api/admin/deals/submitted`    | Admin  | List submitted deals |
| POST   | `/api/admin/deals/:id/approve`  | Admin  | Publish deal         |
| POST   | `/api/admin/deals/:id/reject`   | Admin  | Reject with reason   |
| GET    | `/api/admin/bot-interactions`   | Admin  | Audit AI bot logs    |

### Favorites
| Method | Route                     | Access | Description      |
|--------|---------------------------|--------|------------------|
| GET    | `/api/favorites`          | Auth   | List favorites   |
| POST   | `/api/favorites/:dealId`  | Auth   | Add favorite     |
| DELETE | `/api/favorites/:dealId`  | Auth   | Remove favorite  |

### Restaurants
| Method | Route                        | Access | Description                |
|--------|------------------------------|--------|----------------------------|
| GET    | `/api/restaurants/:id`       | Public | Get restaurant by id       |
| GET    | `/api/restaurants/owner/me`  | Owner  | Get own restaurant profile |
| POST   | `/api/restaurants/owner`     | Owner  | Create restaurant profile  |
| PUT    | `/api/restaurants/owner`     | Owner  | Update restaurant profile  |

### Orders
| Method | Route                          | Access | Description             |
|--------|--------------------------------|--------|-------------------------|
| POST   | `/api/orders`                  | Auth   | Create order (checkout) |
| GET    | `/api/orders`                  | Auth   | List own orders         |
| GET    | `/api/owner/orders`            | Owner  | List restaurant orders  |
| PUT    | `/api/owner/orders/:id/status` | Owner  | Update order status     |

### Payments
| Method | Route                         | Access | Description                 |
|--------|-------------------------------|--------|-----------------------------|
| POST   | `/api/payments/create-intent` | Auth   | Create Stripe PaymentIntent |
| POST   | `/api/webhooks/stripe`        | Public | Stripe webhook (raw body)   |

### Notifications
| Method | Route                          | Access | Description        |
|--------|--------------------------------|--------|--------------------|
| GET    | `/api/notifications`           | Auth   | List notifications |
| PATCH  | `/api/notifications/:id/read`  | Auth   | Mark one read      |
| PATCH  | `/api/notifications/read-all`  | Auth   | Mark all read      |

### Bot Chat
| Method | Route          | Access | Description                   |
|--------|----------------|--------|-------------------------------|
| POST   | `/api/bot/chat`| Auth   | Send message, get AI response |

### External (Yelp Proxy)
| Method | Route                                   | Access | Description                 |
|--------|-----------------------------------------|--------|-----------------------------|
| GET    | `/api/external/places?query=&near=`     | Auth   | Search restaurants via Yelp |

## Project Structure

```
src/
  app.ts                  Express app setup
  server.ts               Entry point
  config/
    env.ts                Environment config
  db/
    connect.ts            MongoDB connection
  middleware/
    requireAuth.ts        JWT verification
    requireRole.ts        Role-based access
    errorHandler.ts       Global error catch
  models/
    User.ts               User schema + role validation
    Restaurant.ts         Restaurant schema + indexes
    Deal.ts               Deal schema + indexes
    Favorite.ts           Favorite schema + unique index
    Order.ts              Order schema + item snapshots
    Notification.ts       Notification schema
    BotInteraction.ts     AI bot audit log schema
  routes/
    auth.ts               Register / login / me
    deals.public.ts       Public deal feed
    deals.owner.ts        Owner CRUD + submit
    deals.admin.ts        Admin approve / reject
    favorites.ts          Favorite CRUD
    orders.ts             Customer order CRUD
    orders.owner.ts       Owner order management
    payments.ts           Stripe payment intent
    webhooks.ts           Stripe webhook handler
    notifications.ts      Notification CRUD
    bot.ts                Groq AI chat
    external.ts           Yelp API proxy
    restaurants.ts        Restaurant CRUD
  scripts/
    seed.ts               Seed 150 demo deals
    enrich-yelp.ts        Import real Yelp restaurants
```

## Related

- Frontend repo: [restaurant-deals-web](https://github.com/traliach/restaurant-deals-web)
