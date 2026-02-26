import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth";
import { requireRole } from "../middleware/requireRole";

const router = Router();

router.use(requireAuth, requireRole(["admin"]));

router.get("/deals/submitted", (_req, res) => {
  return res.status(501).json({ ok: false, error: "Not implemented" });
});

router.post("/deals/:id/approve", (_req, res) => {
  return res.status(501).json({ ok: false, error: "Not implemented" });
});

router.post("/deals/:id/reject", (_req, res) => {
  return res.status(501).json({ ok: false, error: "Not implemented" });
});

export default router;
