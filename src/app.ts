import cors from "cors";
import express from "express";
import authRoutes from "./routes/auth";
import publicDealsRoutes from "./routes/deals.public";

const app = express();

app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, data: { status: "up" } });
});

app.use("/api/auth", authRoutes);
app.use("/api/deals", publicDealsRoutes);

export default app;
