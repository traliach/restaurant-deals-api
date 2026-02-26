import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth";
import { requireRole } from "../middleware/requireRole";

const router = Router();

router.use(requireAuth, requireRole(["owner"]));

router.post("/deals", (_req, res) => {
  return res.status(501).json({ ok: false, error: "Not implemented" });
});

router.put("/deals/:id", (_req, res) => {
  return res.status(501).json({ ok: false, error: "Not implemented" });
});

router.delete("/deals/:id", (_req, res) => {
  return res.status(501).json({ ok: false, error: "Not implemented" });
});

router.post("/deals/:id/submit", (_req, res) => {
  return res.status(501).json({ ok: false, error: "Not implemented" });
});

router.get("/deals", (_req, res) => {
  return res.status(501).json({ ok: false, error: "Not implemented" });
});

export default router;
