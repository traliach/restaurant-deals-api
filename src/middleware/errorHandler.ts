import { NextFunction, Request, Response } from "express";

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  // Final error fallback.
  console.error(err);
  return res.status(500).json({ ok: false, error: "server error" });
}
