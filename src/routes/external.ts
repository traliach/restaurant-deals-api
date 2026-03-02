import { Router } from "express";
import { env } from "../config/env";
import { requireAuth } from "../middleware/requireAuth";

const router = Router();

// Yelp proxy — API key never exposed to frontend.
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

    // Use location text (near) or fall back to "New York, NY".
    const location = near && near.trim() ? near.trim() : "New York, NY";

    const params = new URLSearchParams({
      term: query,
      location,
      limit: String(Math.min(Number(limit), 20)),
      categories: "restaurants",
    });

    const response = await fetch(
      `https://api.yelp.com/v3/businesses/search?${params.toString()}`,
      {
        headers: {
          Authorization: `Bearer ${env.YELP_API_KEY}`,
          Accept: "application/json",
        },
      }
    );

    if (!response.ok) {
      return res.status(502).json({ ok: false, error: "yelp error" });
    }

    const raw = await response.json() as {
      businesses?: {
        id: string;
        name: string;
        rating?: number;
        image_url?: string;
        url?: string;
        phone?: string;
        location?: {
          display_address?: string[];
          city?: string;
        };
        coordinates?: { latitude?: number; longitude?: number };
        categories?: { title: string }[];
      }[];
    };

    // Sanitize — only send what the frontend needs.
    const places = (raw.businesses ?? []).map((b) => ({
      id: b.id,
      name: b.name,
      address: b.location?.display_address?.join(", ") ?? "",
      city: b.location?.city ?? "",
      category: b.categories?.[0]?.title ?? "Restaurant",
      rating: b.rating ?? null,
      imageUrl: b.image_url ?? null,
      website: b.url ?? null,
      phone: b.phone ?? null,
      latitude: b.coordinates?.latitude ?? null,
      longitude: b.coordinates?.longitude ?? null,
    }));

    return res.json({ ok: true, data: places });
  } catch {
    return res.status(500).json({ ok: false, error: "server error" });
  }
});

export default router;
