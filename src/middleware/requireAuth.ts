import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  // Extract JWT from header.
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : "";

  if (!token) {
    return res.status(401).json({ ok: false, error: "unauthenticated" });
  }

  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as { sub?: string; role?: string };
    if (!payload.sub) {
      return res.status(401).json({ ok: false, error: "unauthenticated" });
    }

    // Store userId and role.
    res.locals.auth = { userId: payload.sub, role: payload.role };
    return next();
  } catch {
    return res.status(401).json({ ok: false, error: "unauthenticated" });
  }
}
