import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { UserModel } from "../models/User";

const router = Router();

router.post("/register", async (req, res) => {
  try {
    const { email, password, role = "customer", restaurantId } = req.body as {
      email?: string;
      password?: string;
      role?: "customer" | "owner" | "admin";
      restaurantId?: string;
    };

    if (!email || !password) {
      return res.status(400).json({ ok: false, error: "email and password are required" });
    }

    if (role === "owner" && !restaurantId) {
      return res.status(400).json({ ok: false, error: "restaurantId is required for owner" });
    }

    const existing = await UserModel.findOne({ email: email.toLowerCase() });
    if (existing) {
      return res.status(409).json({ ok: false, error: "email already registered" });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await UserModel.create({
      email: email.toLowerCase(),
      passwordHash,
      role,
      restaurantId,
    });

    const token = jwt.sign({ sub: user._id.toString(), role: user.role }, env.JWT_SECRET, {
      expiresIn: "7d",
    });

    return res.status(201).json({
      ok: true,
      data: {
        token,
        user: {
          id: user._id.toString(),
          email: user.email,
          role: user.role,
          restaurantId: user.restaurantId,
        },
      },
    });
  } catch {
    return res.status(500).json({ ok: false, error: "server error" });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body as { email?: string; password?: string };
    if (!email || !password) {
      return res.status(400).json({ ok: false, error: "email and password are required" });
    }

    const user = await UserModel.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(401).json({ ok: false, error: "invalid credentials" });
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ ok: false, error: "invalid credentials" });
    }

    const token = jwt.sign({ sub: user._id.toString(), role: user.role }, env.JWT_SECRET, {
      expiresIn: "7d",
    });

    return res.json({
      ok: true,
      data: {
        token,
        user: {
          id: user._id.toString(),
          email: user.email,
          role: user.role,
          restaurantId: user.restaurantId,
        },
      },
    });
  } catch {
    return res.status(500).json({ ok: false, error: "server error" });
  }
});

router.get("/me", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) {
      return res.status(401).json({ ok: false, error: "unauthenticated" });
    }

    const payload = jwt.verify(token, env.JWT_SECRET) as { sub?: string };
    if (!payload.sub) {
      return res.status(401).json({ ok: false, error: "unauthenticated" });
    }

    const user = await UserModel.findById(payload.sub);
    if (!user) {
      return res.status(404).json({ ok: false, error: "user not found" });
    }

    return res.json({
      ok: true,
      data: {
        user: {
          id: user._id.toString(),
          email: user.email,
          role: user.role,
          restaurantId: user.restaurantId,
        },
      },
    });
  } catch {
    return res.status(401).json({ ok: false, error: "unauthenticated" });
  }
});

export default router;
