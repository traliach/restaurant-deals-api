import { Router } from "express";
import { env } from "../config/env";
import { requireAuth } from "../middleware/requireAuth";

const router = Router();

// Proxy — API key never exposed to frontend.
router.get("/places", requireAuth, async (req, res) => {
  try {
    const { query, near, limit = "10" } = req.query as {
      query?: string;
      near?: string;
      limit?: string;
    };

    if (!query) {
      return res.status(400).json({ ok: false, error: "query is required" });
    }

    const params = new URLSearchParams({ query, limit });
    if (near) params.set("near", near);

    const response = await fetch(
      `https://api.foursquare.com/v3/places/search?${params.toString()}`,
      {
        headers: {
          Authorization: env.FOURSQUARE_API_KEY,
          Accept: "application/json",
        },
      }
    );

    if (!response.ok) {
      return res.status(502).json({ ok: false, error: "foursquare error" });
    }

    const raw = await response.json() as {
      results?: {
        fsq_id: string;
        name: string;
        location?: { formatted_address?: string; locality?: string };
        categories?: { name: string }[];
      }[];
    };

    // Sanitize — only send what the frontend needs.
    const places = (raw.results ?? []).map((p) => ({
      fsq_id: p.fsq_id,
      name: p.name,
      address: p.location?.formatted_address ?? p.location?.locality ?? "",
      category: p.categories?.[0]?.name ?? "Restaurant",
    }));

    return res.json({ ok: true, data: places });
  } catch {
    return res.status(500).json({ ok: false, error: "server error" });
  }
});

export default router;
