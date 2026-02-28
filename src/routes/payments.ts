import { Router } from "express";
import Stripe from "stripe";
import { env } from "../config/env";
import { requireAuth } from "../middleware/requireAuth";

const router = Router();

// Stripe handles PCI compliance.
const stripe = new Stripe(env.STRIPE_SECRET_KEY);

// Customer: create a PaymentIntent before checkout.
router.post("/create-intent", requireAuth, async (req, res) => {
  try {
    const { amount } = req.body as { amount?: number };

    if (!amount || amount <= 0) {
      return res.status(400).json({ ok: false, error: "amount required (cents)" });
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency: "usd",
      automatic_payment_methods: { enabled: true },
    });

    return res.json({ ok: true, data: { clientSecret: paymentIntent.client_secret } });
  } catch {
    return res.status(500).json({ ok: false, error: "stripe error" });
  }
});

export default router;
