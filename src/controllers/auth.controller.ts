/**
 * auth.controller.ts
 *
 * Handles user authentication:
 *  - register : create a new account (customer, owner, or admin)
 *  - login    : verify credentials and return a JWT token
 *  - me       : return the currently logged-in user's profile
 *
 * We use JWT (JSON Web Token) for authentication.
 * Once a user logs in, the server gives them a token.
 * The client stores it and sends it with every request in the Authorization header.
 * The server verifies the token without needing to hit the database on every request.
 */

import { NextFunction, Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { UserModel } from "../models/User";

/**
 * Builds a safe user object to send back to the client.
 * We NEVER send the passwordHash — this strips it out.
 */
function buildUserPayload(user: {
  _id: unknown;
  email: string;
  role: string;
  restaurantId?: string | null;
}) {
  return {
    id: String(user._id),
    email: user.email,
    role: user.role,
    restaurantId: user.restaurantId,
  };
}

// ─── Register ─────────────────────────────────────────────────────────────────

export async function register(req: Request, res: Response, next: NextFunction) {
  try {
    const {
      email,
      password,
      role = "customer",
      restaurantId,
    } = req.body as {
      email?: string;
      password?: string;
      role?: "customer" | "owner" | "admin";
      restaurantId?: string;
    };

    console.log(`[register] Attempt: email=${email} role=${role}`);

    // Basic validation — both fields are required
    if (!email || !password) {
      console.log("[register] Rejected — missing email or password");
      return res.status(400).json({ ok: false, error: "email and password are required" });
    }

    // Owners must supply a restaurantId so their deals can be linked to a restaurant
    if (role === "owner" && !restaurantId) {
      console.log("[register] Rejected — owner missing restaurantId");
      return res.status(400).json({ ok: false, error: "restaurantId is required for owner" });
    }

    // Check if this email is already taken
    const existing = await UserModel.findOne({ email: email.toLowerCase() });
    if (existing) {
      console.log(`[register] Rejected — email already registered: ${email}`);
      return res.status(409).json({ ok: false, error: "email already registered" });
    }

    // Hash the password before saving — NEVER store plain-text passwords.
    // bcrypt adds a "salt" automatically so two identical passwords produce different hashes.
    // The number 10 is the "cost factor" — higher = slower = harder to brute-force.
    const passwordHash = await bcrypt.hash(password, 10);

    const user = await UserModel.create({
      email: email.toLowerCase(),
      passwordHash,
      role,
      restaurantId,
    });

    console.log(`[register] User created: userId=${user._id} email=${user.email} role=${user.role}`);

    // Sign a JWT that expires in 7 days.
    // The payload contains the user's ID and role so middleware can identify them.
    const token = jwt.sign(
      { sub: user._id.toString(), role: user.role },
      env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    return res.status(201).json({ ok: true, data: { token, user: buildUserPayload(user) } });
  } catch (err) {
    console.error("[register] Unexpected error:", err);
    return next(err);
  }
}

// ─── Login ────────────────────────────────────────────────────────────────────

export async function login(req: Request, res: Response, next: NextFunction) {
  try {
    const { email, password } = req.body as { email?: string; password?: string };

    console.log(`[login] Attempt: email=${email}`);

    if (!email || !password) {
      console.log("[login] Rejected — missing email or password");
      return res.status(400).json({ ok: false, error: "email and password are required" });
    }

    // Look up the user by email (emails are stored lowercase)
    const user = await UserModel.findOne({ email: email.toLowerCase() });

    if (!user) {
      // Return a generic "invalid credentials" message — never reveal whether
      // the email exists or the password is wrong. This prevents "user enumeration".
      console.log(`[login] Rejected — user not found: ${email}`);
      return res.status(401).json({ ok: false, error: "invalid credentials" });
    }

    // Compare the submitted password against the stored hash
    const isMatch = await bcrypt.compare(password, user.passwordHash);

    if (!isMatch) {
      console.log(`[login] Rejected — wrong password for: ${email}`);
      return res.status(401).json({ ok: false, error: "invalid credentials" });
    }

    // Issue a fresh JWT
    const token = jwt.sign(
      { sub: user._id.toString(), role: user.role },
      env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    console.log(`[login] Success: userId=${user._id} role=${user.role}`);
    return res.json({ ok: true, data: { token, user: buildUserPayload(user) } });
  } catch (err) {
    console.error("[login] Unexpected error:", err);
    return next(err);
  }
}

// ─── Me ───────────────────────────────────────────────────────────────────────

export async function me(_req: Request, res: Response, next: NextFunction) {
  try {
    // The auth middleware already decoded the token and stored the userId
    const userId = res.locals.auth?.userId as string | undefined;
    const user = userId ? await UserModel.findById(userId) : null;

    if (!user) {
      console.log(`[me] User not found: userId=${userId}`);
      return res.status(404).json({ ok: false, error: "user not found" });
    }

    console.log(`[me] userId=${user._id} email=${user.email} role=${user.role}`);
    return res.json({ ok: true, data: { user: buildUserPayload(user) } });
  } catch (err) {
    console.error("[me] Unexpected error:", err);
    return next(err);
  }
}
