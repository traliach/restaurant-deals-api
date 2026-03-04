import { NextFunction, Request, Response } from "express";

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`[error] ${_req.method} ${_req.originalUrl} ${res.locals.requestId ?? ""} — ${msg.slice(0, 500)}`);
  return res.status(500).json({ ok: false, error: "server error" });
}
