import { NextFunction, Request, Response } from "express";

export function requireRole(allowed: Array<"customer" | "owner" | "admin">) {
  // Check role from JWT payload.
  return (_req: Request, res: Response, next: NextFunction) => {
    const role = res.locals.auth?.role as "customer" | "owner" | "admin" | undefined;
    if (!role || !allowed.includes(role)) {
      return res.status(403).json({ ok: false, error: "unauthorized" });
    }
    return next();
  };
}
