/**
 * admin.controller.ts
 *
 * All routes here are protected by requireRole("admin") middleware.
 * Only users with role="admin" can call these endpoints.
 *
 * Available admin actions:
 *  - getStats          : dashboard summary (user counts, deal counts, top owners)
 *  - getAllUsers        : full user list (passwords excluded)
 *  - getAllDeals        : every deal regardless of status
 *  - getSubmittedDeals : deals waiting for admin review
 *  - approveDeal       : publish a submitted deal and notify the owner
 *  - rejectDeal        : reject a deal with a reason and notify the owner
 *  - deleteUser        : remove a user (can't delete yourself or another admin)
 *  - getBotInteractions: logs of AI chatbot usage
 */

import { NextFunction, Request, Response } from "express";
import { BotInteractionModel } from "../models/BotInteraction";
import { DealModel } from "../models/Deal";
import { NotificationModel } from "../models/Notification";
import { RestaurantModel } from "../models/Restaurant";
import { UserModel } from "../models/User";

// ─── Dashboard Stats ──────────────────────────────────────────────────────────

export async function getStats(_req: Request, res: Response, next: NextFunction) {
  try {
    // Run all aggregation queries in parallel with Promise.all.
    // This is faster than running them sequentially because MongoDB handles them at the same time.
    const [totalUsers, owners, customers, admins, totalRestaurants, dealsByStatus, topOwnersRaw] =
      await Promise.all([
        UserModel.countDocuments(),
        UserModel.countDocuments({ role: "owner" }),
        UserModel.countDocuments({ role: "customer" }),
        UserModel.countDocuments({ role: "admin" }),
        RestaurantModel.countDocuments(),
        // Aggregate: group all deals by status and count each group
        DealModel.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
        // Aggregate: find the top 5 owners by number of deals created
        DealModel.aggregate([
          {
            $group: {
              _id: "$createdByUserId",
              totalDeals: { $sum: 1 },
              // Count published deals with a conditional sum ($cond = if/else in aggregation)
              published: { $sum: { $cond: [{ $eq: ["$status", "PUBLISHED"] }, 1, 0] } },
            },
          },
          { $sort: { totalDeals: -1 } },
          { $limit: 5 },
          // $lookup is a JOIN: attach the user document to each group result
          { $lookup: { from: "users", localField: "_id", foreignField: "_id", as: "user" } },
          { $unwind: { path: "$user", preserveNullAndEmptyArrays: true } },
          {
            $project: {
              _id: 0,
              email: "$user.email",
              restaurantId: "$user.restaurantId",
              totalDeals: 1,
              published: 1,
            },
          },
        ]),
      ]);

    // Convert the aggregation array into a flat object: { DRAFT: 5, PUBLISHED: 10, ... }
    const dealCounts = { DRAFT: 0, SUBMITTED: 0, PUBLISHED: 0, REJECTED: 0 } as Record<string, number>;
    for (const d of dealsByStatus) dealCounts[d._id as string] = d.count;

    console.log(`[getStats] users=${totalUsers} restaurants=${totalRestaurants} deals=${JSON.stringify(dealCounts)}`);

    return res.json({
      ok: true,
      data: { totalUsers, owners, customers, admins, totalRestaurants, dealCounts, topOwners: topOwnersRaw },
    });
  } catch (err) {
    console.error("[getStats] Unexpected error:", err);
    return next(err);
  }
}

// ─── User Management ──────────────────────────────────────────────────────────

export async function getAllUsers(_req: Request, res: Response, next: NextFunction) {
  try {
    // The "-passwordHash" projection excludes the password field from results.
    // Never expose password hashes through any API — not even to admins.
    const users = await UserModel.find({}, "-passwordHash").sort({ createdAt: -1 });
    console.log(`[getAllUsers] Returned ${users.length} users`);
    return res.json({ ok: true, data: users });
  } catch (err) {
    console.error("[getAllUsers] Unexpected error:", err);
    return next(err);
  }
}

export async function deleteUser(req: Request, res: Response, next: NextFunction) {
  try {
    // Who is making the request?
    const requesterId = res.locals.auth?.userId as string | undefined;
    const target = await UserModel.findById(req.params.id);

    if (!target) {
      console.log(`[deleteUser] Not found: userId=${req.params.id}`);
      return res.status(404).json({ ok: false, error: "user not found" });
    }

    // Safety check: an admin cannot delete their own account
    if (target._id.toString() === requesterId) {
      console.log(`[deleteUser] Rejected — cannot delete yourself`);
      return res.status(400).json({ ok: false, error: "cannot delete yourself" });
    }

    // Safety check: admins cannot delete other admins (prevents accidental lockout)
    if (target.role === "admin") {
      console.log(`[deleteUser] Rejected — cannot delete another admin: targetId=${target._id}`);
      return res.status(403).json({ ok: false, error: "cannot delete another admin" });
    }

    await UserModel.deleteOne({ _id: target._id });
    console.log(`[deleteUser] Deleted: userId=${target._id} email=${target.email}`);
    return res.json({ ok: true, data: { deleted: true } });
  } catch (err) {
    console.error("[deleteUser] Unexpected error:", err);
    return next(err);
  }
}

// ─── Deal Management ──────────────────────────────────────────────────────────

export async function getAllDeals(_req: Request, res: Response, next: NextFunction) {
  try {
    const items = await DealModel.find().sort({ createdAt: -1 });
    console.log(`[getAllDeals] Returned ${items.length} deals`);
    return res.json({ ok: true, data: items });
  } catch (err) {
    console.error("[getAllDeals] Unexpected error:", err);
    return next(err);
  }
}

export async function getSubmittedDeals(_req: Request, res: Response, next: NextFunction) {
  try {
    // Only show SUBMITTED deals — these are waiting for an admin to approve or reject
    const items = await DealModel.find({ status: "SUBMITTED" }).sort({ createdAt: -1 });
    console.log(`[getSubmittedDeals] Returned ${items.length} submitted deals`);
    return res.json({ ok: true, data: items });
  } catch (err) {
    console.error("[getSubmittedDeals] Unexpected error:", err);
    return next(err);
  }
}

export async function approveDeal(req: Request, res: Response, next: NextFunction) {
  try {
    const deal = await DealModel.findById(req.params.id);

    if (!deal) {
      console.log(`[approveDeal] Not found: dealId=${req.params.id}`);
      return res.status(404).json({ ok: false, error: "deal not found" });
    }

    // Only SUBMITTED deals can be approved — reject any other status
    if (deal.status !== "SUBMITTED") {
      console.log(`[approveDeal] Illegal transition: current status="${deal.status}"`);
      return res.status(409).json({ ok: false, error: "illegal transition" });
    }

    deal.status = "PUBLISHED";
    deal.rejectionReason = undefined;

    // If the owner did not set a custom expiry, or the expiry already passed,
    // auto-set it to 24 hours from now so the deal goes live immediately
    if (!deal.endAt || deal.endAt < new Date()) {
      deal.endAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      console.log(`[approveDeal] No endAt set — defaulting to 24h from now`);
    }

    await deal.save();

    // Send an in-app notification to the owner so they know their deal is live
    await NotificationModel.create({
      userId: deal.createdByUserId,
      type: "deal_approved",
      message: `Your deal "${deal.title}" was approved and is now live.`,
      dealId: deal._id,
    });

    console.log(`[approveDeal] dealId=${deal._id} title="${deal.title}" is now PUBLISHED`);
    return res.json({ ok: true, data: deal });
  } catch (err) {
    console.error("[approveDeal] Unexpected error:", err);
    return next(err);
  }
}

export async function rejectDeal(req: Request, res: Response, next: NextFunction) {
  try {
    const { reason } = req.body as { reason?: string };

    if (!reason || !reason.trim()) {
      console.log(`[rejectDeal] Rejected — no reason provided`);
      return res.status(400).json({ ok: false, error: "reason is required" });
    }

    const deal = await DealModel.findById(req.params.id);

    if (!deal) {
      console.log(`[rejectDeal] Not found: dealId=${req.params.id}`);
      return res.status(404).json({ ok: false, error: "deal not found" });
    }

    if (deal.status !== "SUBMITTED") {
      console.log(`[rejectDeal] Illegal transition: current status="${deal.status}"`);
      return res.status(409).json({ ok: false, error: "illegal transition" });
    }

    deal.status = "REJECTED";
    deal.rejectionReason = reason.trim();
    await deal.save();

    // Notify the owner with the specific rejection reason so they know what to fix
    await NotificationModel.create({
      userId: deal.createdByUserId,
      type: "deal_rejected",
      message: `Your deal "${deal.title}" was rejected. Reason: ${reason.trim()}`,
      dealId: deal._id,
    });

    console.log(`[rejectDeal] dealId=${deal._id} title="${deal.title}" REJECTED — reason: ${reason.trim()}`);
    return res.json({ ok: true, data: deal });
  } catch (err) {
    console.error("[rejectDeal] Unexpected error:", err);
    return next(err);
  }
}

// ─── Bot Interaction Logs ─────────────────────────────────────────────────────

export async function getBotInteractions(_req: Request, res: Response, next: NextFunction) {
  try {
    // Fetch the 100 most recent AI chatbot interactions.
    // populate("userId", "email role") does a JOIN-like lookup to attach
    // the user's email and role to each log entry for readability.
    const logs = await BotInteractionModel.find()
      .sort({ createdAt: -1 })
      .limit(100)
      .populate("userId", "email role");

    console.log(`[getBotInteractions] Returned ${logs.length} bot interaction logs`);
    return res.json({ ok: true, data: logs });
  } catch (err) {
    console.error("[getBotInteractions] Unexpected error:", err);
    return next(err);
  }
}
