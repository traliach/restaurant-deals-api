import { Router } from "express";

const router = Router();

router.post("/register", (_req, res) => {
  return res.status(501).json({ ok: false, error: "Not implemented" });
});

router.post("/login", (_req, res) => {
  return res.status(501).json({ ok: false, error: "Not implemented" });
});

router.get("/me", (_req, res) => {
  return res.status(501).json({ ok: false, error: "Not implemented" });
});

export default router;
