import cors from "cors";
import crypto from "crypto";
import express from "express";
import rateLimit from "express-rate-limit";
import { errorHandler } from "./middleware/errorHandler";
import authRoutes from "./routes/auth";
import adminDealsRoutes from "./routes/deals.admin";
import ownerDealsRoutes from "./routes/deals.owner";
import publicDealsRoutes from "./routes/deals.public";
import favoritesRoutes from "./routes/favorites";
import orderRoutes from "./routes/orders";
import paymentRoutes from "./routes/payments";
import ownerOrderRoutes from "./routes/orders.owner";
import restaurantRoutes from "./routes/restaurants";
import botRoutes from "./routes/bot";
import externalRoutes from "./routes/external";
import notificationRoutes from "./routes/notifications";
import webhookRoutes from "./routes/webhooks";

const app = express();

// Minimal rate limiting for high-risk routes.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

const writeLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
});

const botLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
});

// Webhook must use raw body — mount before express.json().
app.use("/api/webhooks", webhookRoutes);

// Global middleware setup.
app.use(cors());
app.use(express.json());

app.use((req, res, next) => {
  const requestId = crypto.randomUUID();
  res.locals.requestId = requestId;
  const start = Date.now();
  console.log(`[req] ${req.method} ${req.originalUrl} ${requestId}`);
  res.on("finish", () => {
    console.log(`[res] ${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - start}ms ${requestId}`);
  });
  next();
});

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, data: { status: "up" } });
});

// Route groups split by access level.
app.use("/api/auth", authLimiter, authRoutes);
app.use("/api/deals", publicDealsRoutes);         // No auth needed
app.use("/api/owner", writeLimiter, ownerDealsRoutes);          // Owner role required
app.use("/api/admin", writeLimiter, adminDealsRoutes);          // Admin role required
app.use("/api/favorites", favoritesRoutes);       // Any logged-in user
app.use("/api/restaurants", restaurantRoutes);    // Public + owner
app.use("/api/orders", writeLimiter, orderRoutes);              // Auth required
app.use("/api/owner", ownerOrderRoutes);          // Owner orders
app.use("/api/payments", paymentRoutes);          // Stripe payment intent
app.use("/api/notifications", notificationRoutes); // Auth required
app.use("/api/bot", botLimiter, botRoutes);                    // Auth required
app.use("/api/external", externalRoutes);          // Proxy Yelp search for owners
app.use(errorHandler);

export default app;
