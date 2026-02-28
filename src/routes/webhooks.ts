import express, { Router } from "express";
import Stripe from "stripe";
import { env } from "../config/env";
import { OrderModel } from "../models/Order";

const router = Router();

const stripe = new Stripe(env.STRIPE_SECRET_KEY);

// Raw body required — Stripe verifies signature against it.
router.post("/stripe", express.raw({ type: "application/json" }), async (req, res) => {
  const sig = req.headers["stripe-signature"];

  if (!sig || !env.STRIPE_WEBHOOK_SECRET) {
    return res.status(400).json({ ok: false, error: "missing signature" });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(req.body as Buffer, sig, env.STRIPE_WEBHOOK_SECRET);
  } catch {
    return res.status(400).json({ ok: false, error: "webhook signature invalid" });
  }

  if (event.type === "payment_intent.succeeded") {
    const intent = event.data.object as Stripe.PaymentIntent;

    // Mark matching order as paid.
    await OrderModel.findOneAndUpdate(
      { stripePaymentIntentId: intent.id },
      { paidAt: new Date() }
    );
  }

  return res.json({ ok: true, data: { received: true } });
});

export default router;
