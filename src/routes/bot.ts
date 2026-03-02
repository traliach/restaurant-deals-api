import { Router } from "express";
import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import { env } from "../config/env";
import { requireAuth } from "../middleware/requireAuth";
import { BotInteractionModel } from "../models/BotInteraction";

const router = Router();

// Filter dispatcher — translates user message into UI filter actions.
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

    if (!env.GEMINI_API_KEY) {
      return res.status(503).json({ ok: false, error: "AI not configured" });
    }

    const genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY);

    const model = genAI.getGenerativeModel({
      model: "gemini-2.0-flash",
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: SchemaType.OBJECT,
          properties: {
            reply: { type: SchemaType.STRING },
            action: {
              type: SchemaType.OBJECT,
              properties: {
                type: {
                  type: SchemaType.STRING,
                  format: "enum",
                  enum: ["SET_FILTERS", "NONE"],
                },
                payload: {
                  type: SchemaType.OBJECT,
                  properties: {
                    maxPrice: { type: SchemaType.NUMBER },
                    city: { type: SchemaType.STRING },
                    dealType: {
                      type: SchemaType.STRING,
                      format: "enum",
                      enum: ["Lunch", "Carryout", "Delivery", "Other"],
                    },
                    sort: {
                      type: SchemaType.STRING,
                      format: "enum",
                      enum: ["newest", "value"],
                    },
                    source: {
                      type: SchemaType.STRING,
                      format: "enum",
                      enum: ["seed", "yelp"],
                    },
                  },
                },
              },
              required: ["type", "payload"],
            },
          },
          required: ["reply", "action"],
        },
      },
    });

    const prompt = `You are Deals Assistant for a restaurant deals marketplace.
Translate the user's message into UI filter instructions.

Available cities: Newark, Jersey City, New York, Brooklyn, Hoboken, Montclair.
Available deal types: Lunch, Carryout, Delivery, Other.
Available sort options: newest (default), value (best discount).
Available sources: seed (demo data), yelp (real restaurants).

Rules:
- Dollar amounts like "$5" or "under 10" → set maxPrice.
- City mention → set city (match exactly to available cities).
- "lunch", "delivery", "carryout" → set dealType.
- "best deal" or "cheapest" → set sort=value.
- Multiple constraints are allowed in one payload.
- Keep reply short and friendly (1-2 sentences).
- If nothing filter-related → set action.type=NONE and give a helpful tip.

User message: "${message.trim()}"`;

    const result = await model.generateContent(prompt);
    const raw = result.response.text();
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
      action: `${parsed.action.type}: ${JSON.stringify(parsed.action.payload)}`,
      result: parsed.reply,
    });

    return res.json({ ok: true, data: parsed });
  } catch {
    return res.status(500).json({ ok: false, error: "bot error" });
  }
});

export default router;
