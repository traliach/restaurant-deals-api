import { Router, Request, Response, NextFunction } from "express";
import rateLimit from "express-rate-limit";
import { env } from "../config/env";
import { requireAuth } from "../middleware/requireAuth";

const router = Router();

// ── Rate limit: 20 requests per IP per minute ────────────────────────────────
const placesLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: "Too many requests — please wait before searching again." },
});

// ── 60-second in-memory response cache ───────────────────────────────────────
type CacheEntry = { data: unknown; expiresAt: number };
const responseCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60_000;

function getCached(key: string): unknown | null {
  const entry = responseCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    responseCache.delete(key);
    return null;
  }
  return entry.data;
}

function setCached(key: string, data: unknown): void {
  responseCache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
}

// Proxy — API key never exposed to frontend.
// Accepts ll=lat,lng (preferred, no geocoding quota) instead of near=.
router.get(
  "/places",
  requireAuth,
  placesLimiter as (req: Request, res: Response, next: NextFunction) => void,
  async (req: Request, res: Response) => {
    try {
      const { query, ll, limit = "10" } = req.query as {
        query?: string;
        ll?: string;
        limit?: string;
      };

      if (!query) {
        return res.status(400).json({ ok: false, error: "query is required" });
      }
      if (!ll || !/^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/.test(ll)) {
        return res
          .status(400)
          .json({ ok: false, error: "ll is required and must be in lat,lng format (e.g. ll=40.73,-74.17)" });
      }

      // Serve from cache when available — prevents duplicate Foursquare calls.
      const cacheKey = `${query}|${ll}|${limit}`;
      const cached = getCached(cacheKey);
      if (cached) {
        return res.json({ ok: true, data: cached, cached: true });
      }

      const params = new URLSearchParams({
        query,
        ll,
        limit,
        fields: "fsq_id,name,location,categories,photos,rating,website,tel,geocodes",
      });

      const response = await fetch(
        `https://places-api.foursquare.com/places/search?${params.toString()}`,
        {
          headers: {
            Authorization: `Bearer ${env.FOURSQUARE_API_KEY}`,
            Accept: "application/json",
            "X-Places-Api-Version": "2025-06-17",
          },
        }
      );

      if (!response.ok) {
        const status = response.status === 429 ? 429 : 502;
        return res.status(status).json({ ok: false, error: status === 429 ? "upstream rate limit hit" : "foursquare error" });
      }

      const raw = await response.json() as {
        results?: {
          fsq_place_id: string;
          name: string;
          location?: {
            formatted_address?: string;
            locality?: string;
            address?: string;
          };
          categories?: { name: string }[];
          photos?: { prefix: string; suffix: string }[];
          rating?: number;
          website?: string;
          tel?: string;
          latitude?: number;
          longitude?: number;
        }[];
      };

      const places = (raw.results ?? []).map((p) => {
        const photo = p.photos?.[0];
        const photoUrl = photo ? `${photo.prefix}800x450${photo.suffix}` : null;

        return {
          fsq_id: p.fsq_place_id,
          name: p.name,
          address: p.location?.formatted_address ?? p.location?.locality ?? "",
          city: p.location?.locality ?? "",
          category: p.categories?.[0]?.name ?? "Restaurant",
          rating: p.rating ?? null,
          website: p.website ?? null,
          phone: p.tel ?? null,
          photoUrl,
          latitude: p.latitude ?? null,
          longitude: p.longitude ?? null,
        };
      });

      setCached(cacheKey, places);
      return res.json({ ok: true, data: places });
    } catch {
      return res.status(500).json({ ok: false, error: "server error" });
    }
  }
);

export default router;
