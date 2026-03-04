import { NextFunction, Request, Response } from "express";
import { BotInteractionModel } from "../models/BotInteraction";
import { DealModel } from "../models/Deal";
import { NotificationModel } from "../models/Notification";
import { RestaurantModel } from "../models/Restaurant";
import { UserModel } from "../models/User";

export async function getStats(_req: Request, res: Response, next: NextFunction) {
  try {
    const [totalUsers, owners, customers, admins, totalRestaurants, dealsByStatus, topOwnersRaw] = await Promise.all([
      UserModel.countDocuments(),
      UserModel.countDocuments({ role: "owner" }),
      UserModel.countDocuments({ role: "customer" }),
      UserModel.countDocuments({ role: "admin" }),
      RestaurantModel.countDocuments(),
      DealModel.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
      DealModel.aggregate([
        { $group: { _id: "$createdByUserId", totalDeals: { $sum: 1 }, published: { $sum: { $cond: [{ $eq: ["$status", "PUBLISHED"] }, 1, 0] } } } },
        { $sort: { totalDeals: -1 } },
        { $limit: 5 },
        { $lookup: { from: "users", localField: "_id", foreignField: "_id", as: "user" } },
        { $unwind: { path: "$user", preserveNullAndEmptyArrays: true } },
        { $project: { _id: 0, email: "$user.email", restaurantId: "$user.restaurantId", totalDeals: 1, published: 1 } },
      ]),
    ]);

    const dealCounts = { DRAFT: 0, SUBMITTED: 0, PUBLISHED: 0, REJECTED: 0 } as Record<string, number>;
    for (const d of dealsByStatus) dealCounts[d._id as string] = d.count;

    return res.json({ ok: true, data: { totalUsers, owners, customers, admins, totalRestaurants, dealCounts, topOwners: topOwnersRaw } });
  } catch (err) { return next(err); }
}

export async function getAllUsers(_req: Request, res: Response, next: NextFunction) {
  try {
    const users = await UserModel.find({}, "-passwordHash").sort({ createdAt: -1 });
    return res.json({ ok: true, data: users });
  } catch (err) { return next(err); }
}

export async function getAllDeals(_req: Request, res: Response, next: NextFunction) {
  try {
    const items = await DealModel.find().sort({ createdAt: -1 });
    return res.json({ ok: true, data: items });
  } catch (err) { return next(err); }
}

export async function getSubmittedDeals(_req: Request, res: Response, next: NextFunction) {
  try {
    const items = await DealModel.find({ status: "SUBMITTED" }).sort({ createdAt: -1 });
    return res.json({ ok: true, data: items });
  } catch (err) { return next(err); }
}

export async function approveDeal(req: Request, res: Response, next: NextFunction) {
  try {
    const deal = await DealModel.findById(req.params.id);
    if (!deal) return res.status(404).json({ ok: false, error: "deal not found" });
    if (deal.status !== "SUBMITTED") return res.status(409).json({ ok: false, error: "illegal transition" });

    deal.status = "PUBLISHED";
    deal.rejectionReason = undefined;
    // Auto-expire 24 h from approval unless the owner already set a custom endAt.
    if (!deal.endAt || deal.endAt < new Date()) {
      deal.endAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    }
    await deal.save();

    await NotificationModel.create({
      userId: deal.createdByUserId,
      type: "deal_approved",
      message: `Your deal "${deal.title}" was approved and is now live.`,
      dealId: deal._id,
    });

    return res.json({ ok: true, data: deal });
  } catch (err) { return next(err); }
}

export async function rejectDeal(req: Request, res: Response, next: NextFunction) {
  try {
    const { reason } = req.body as { reason?: string };
    if (!reason || !reason.trim()) return res.status(400).json({ ok: false, error: "reason is required" });

    const deal = await DealModel.findById(req.params.id);
    if (!deal) return res.status(404).json({ ok: false, error: "deal not found" });
    if (deal.status !== "SUBMITTED") return res.status(409).json({ ok: false, error: "illegal transition" });

    deal.status = "REJECTED";
    deal.rejectionReason = reason.trim();
    await deal.save();

    await NotificationModel.create({
      userId: deal.createdByUserId,
      type: "deal_rejected",
      message: `Your deal "${deal.title}" was rejected. Reason: ${reason.trim()}`,
      dealId: deal._id,
    });

    return res.json({ ok: true, data: deal });
  } catch (err) { return next(err); }
}

export async function deleteUser(req: Request, res: Response, next: NextFunction) {
  try {
    const requesterId = res.locals.auth?.userId as string | undefined;
    const target = await UserModel.findById(req.params.id);
    if (!target) return res.status(404).json({ ok: false, error: "user not found" });
    if (target._id.toString() === requesterId)
      return res.status(400).json({ ok: false, error: "cannot delete yourself" });
    if (target.role === "admin")
      return res.status(403).json({ ok: false, error: "cannot delete another admin" });

    await UserModel.deleteOne({ _id: target._id });
    return res.json({ ok: true, data: { deleted: true } });
  } catch (err) { return next(err); }
}

export async function getBotInteractions(_req: Request, res: Response, next: NextFunction) {
  try {
    const logs = await BotInteractionModel.find()
      .sort({ createdAt: -1 })
      .limit(100)
      .populate("userId", "email role");
    return res.json({ ok: true, data: logs });
  } catch (err) { return next(err); }
}
