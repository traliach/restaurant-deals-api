import cors from "cors";
import express from "express";
import { errorHandler } from "./middleware/errorHandler";
import authRoutes from "./routes/auth";
import adminDealsRoutes from "./routes/deals.admin";
import ownerDealsRoutes from "./routes/deals.owner";
import publicDealsRoutes from "./routes/deals.public";
import favoritesRoutes from "./routes/favorites";
import restaurantRoutes from "./routes/restaurants";

const app = express();

// Global middleware setup.
app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, data: { status: "up" } });
});

// Route groups split by access level.
app.use("/api/auth", authRoutes);
app.use("/api/deals", publicDealsRoutes);         // No auth needed
app.use("/api/owner", ownerDealsRoutes);          // Owner role required
app.use("/api/admin", adminDealsRoutes);          // Admin role required
app.use("/api/favorites", favoritesRoutes);       // Any logged-in user
app.use("/api/restaurants", restaurantRoutes);    // Public + owner
app.use(errorHandler);

export default app;
