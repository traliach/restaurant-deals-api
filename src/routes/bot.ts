import { Router } from "express";
import Groq from "groq-sdk";
import { env } from "../config/env";
import { requireAuth } from "../middleware/requireAuth";
import { BotInteractionModel } from "../models/BotInteraction";

const router = Router();

// Filter dispatcher — translates user message into UI filter actions via Groq.
router.post("/chat", requireAuth, async (req, res) => {
  try {
    const userId = res.locals.auth?.userId as string | undefined;
    if (!userId) {
      return res.status(401).json({ ok: false, error: "unauthenticated" });
    }

    const { message } = req.body as { message?: string };
    if (!message || !message.trim()) {
      return res.status(400).json({ ok: false, error: "message required" });
    }

    if (!env.GROQ_API_KEY) {
      return res.status(503).json({ ok: false, error: "AI not configured" });
    }

    const groq = new Groq({ apiKey: env.GROQ_API_KEY });

    const completion = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You are Deals Assistant for a restaurant deals marketplace.
Translate the user's message into UI filter instructions and return ONLY valid JSON.

Available cities: Newark, Jersey City, New York, Brooklyn, Hoboken, Montclair.
Available dealType values: Lunch, Carryout, Delivery, Other.
Available sort values: newest, value (value = best discount first).
Available source values: seed (demo data), yelp (real restaurants).

Return this exact JSON shape:
{
  "reply": "short friendly reply (1-2 sentences)",
  "action": {
    "type": "SET_FILTERS or NONE",
    "payload": {
      "maxPrice": number or omit,
      "city": string or omit,
      "dealType": string or omit,
      "sort": string or omit,
      "source": string or omit
    }
  }
}

Rules:
- Dollar amounts like "$5" or "under 10" → set maxPrice as a number.
- City mention → set city (match exactly to available cities).
- "lunch", "delivery", "carryout" → set dealType.
- "cheap" or "best deal" → set sort="value".
- Set action.type="SET_FILTERS" if any filter applies, otherwise "NONE".
- Keep payload empty object {} when type=NONE.`,
        },
        {
          role: "user",
          content: message.trim(),
        },
      ],
      max_tokens: 200,
      temperature: 0.1,
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw) as {
      reply: string;
      action: {
        type: "SET_FILTERS" | "NONE";
        payload: {
          maxPrice?: number;
          city?: string;
          dealType?: string;
          sort?: string;
          source?: string;
        };
      };
    };

    // Log for admin audit.
    await BotInteractionModel.create({
      userId,
      intent: message.trim(),
      action: `${parsed.action?.type}: ${JSON.stringify(parsed.action?.payload)}`,
      result: parsed.reply,
    });

    return res.json({ ok: true, data: parsed });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[bot] Groq error:", msg.slice(0, 200));
    return res.status(500).json({ ok: false, error: "bot error" });
  }
});

export default router;
