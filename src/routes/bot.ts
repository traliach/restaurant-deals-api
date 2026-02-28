import { Router } from "express";
import OpenAI from "openai";
import { env } from "../config/env";
import { requireAuth } from "../middleware/requireAuth";
import { BotInteractionModel } from "../models/BotInteraction";

const router = Router();

// Only suggests safe actions — client executes them.
const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

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

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are a helpful assistant for a restaurant deals marketplace. " +
            "Suggest safe, specific actions the user can take on the platform " +
            "(browse deals, favorite a deal, place an order, etc.). " +
            "Keep responses concise (2-3 sentences). " +
            "Never suggest anything outside the platform.",
        },
        { role: "user", content: message.trim() },
      ],
      max_tokens: 150,
    });

    const action = completion.choices[0]?.message?.content ?? "No suggestion available.";

    // Log every interaction for admin audit.
    await BotInteractionModel.create({
      userId,
      intent: message.trim(),
      action,
      result: "responded",
    });

    return res.json({ ok: true, data: { action } });
  } catch {
    return res.status(500).json({ ok: false, error: "bot error" });
  }
});

export default router;
