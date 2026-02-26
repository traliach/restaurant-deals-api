import cors from "cors";
import express from "express";
import authRoutes from "./routes/auth";
import adminDealsRoutes from "./routes/deals.admin";
import ownerDealsRoutes from "./routes/deals.owner";
import publicDealsRoutes from "./routes/deals.public";
import favoritesRoutes from "./routes/favorites";

const app = express();

app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, data: { status: "up" } });
});

app.use("/api/auth", authRoutes);
app.use("/api/deals", publicDealsRoutes);
app.use("/api/owner", ownerDealsRoutes);
app.use("/api/admin", adminDealsRoutes);
app.use("/api/favorites", favoritesRoutes);

export default app;
