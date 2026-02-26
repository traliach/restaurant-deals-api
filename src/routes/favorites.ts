import { Router } from "express";
import { DealModel } from "../models/Deal";
import { FavoriteModel } from "../models/Favorite";
import { requireAuth } from "../middleware/requireAuth";

const router = Router();

router.use(requireAuth);

router.get("/", async (req, res) => {
  try {
    const userId = res.locals.auth?.userId as string | undefined;
    if (!userId) {
      return res.status(401).json({ ok: false, error: "unauthenticated" });
    }

    // Include deal info.
    const items = await FavoriteModel.find({ userId })
      .sort({ createdAt: -1 })
      .populate("dealId");

    return res.json({ ok: true, data: items });
  } catch {
    return res.status(500).json({ ok: false, error: "server error" });
  }
});

router.post("/:dealId", async (req, res) => {
  try {
    const userId = res.locals.auth?.userId as string | undefined;
    if (!userId) {
      return res.status(401).json({ ok: false, error: "unauthenticated" });
    }

    const deal = await DealModel.findById(req.params.dealId);
    if (!deal || deal.status !== "PUBLISHED") {
      return res.status(404).json({ ok: false, error: "deal not found" });
    }

    try {
      const favorite = await FavoriteModel.create({ userId, dealId: deal._id });
      return res.status(201).json({ ok: true, data: favorite });
    } catch (error: unknown) {
      // Duplicate means already favorited.
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        (error as { code?: number }).code === 11000
      ) {
        return res.json({ ok: true, data: { alreadyFavorited: true } });
      }
      return res.status(500).json({ ok: false, error: "server error" });
    }
  } catch {
    return res.status(500).json({ ok: false, error: "server error" });
  }
});

router.delete("/:dealId", async (req, res) => {
  try {
    const userId = res.locals.auth?.userId as string | undefined;
    if (!userId) {
      return res.status(401).json({ ok: false, error: "unauthenticated" });
    }

    await FavoriteModel.deleteOne({ userId, dealId: req.params.dealId });
    return res.json({ ok: true, data: { deleted: true } });
  } catch {
    return res.status(500).json({ ok: false, error: "server error" });
  }
});

export default router;
