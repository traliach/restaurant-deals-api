import { InferSchemaType, Schema, model } from "mongoose";

// Snapshot — price locked at purchase time.
const orderItemSchema = new Schema(
  {
    dealId: { type: Schema.Types.ObjectId, ref: "Deal", required: true },
    title: { type: String, required: true },
    restaurantId: { type: String, required: true },
    restaurantName: { type: String, required: true },
    price: { type: Number, required: true },
    qty: { type: Number, required: true, min: 1 },
    dealAtPurchase: { type: Schema.Types.Mixed, required: true },
  },
  { _id: false }
);

const orderSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    items: { type: [orderItemSchema], required: true },
    total: { type: Number, required: true },
    // Order state transitions.
    status: {
      type: String,
      enum: ["Placed", "Preparing", "Ready", "Completed"],
      default: "Placed",
      required: true,
    },
    paidAt: { type: Date },
    stripePaymentIntentId: { type: String, trim: true },
  },
  { timestamps: true }
);

// Fast customer order history lookup.
orderSchema.index({ userId: 1, createdAt: -1 });
// Fast owner order lookup by restaurant.
orderSchema.index({ "items.restaurantId": 1, createdAt: -1 });

export type Order = InferSchemaType<typeof orderSchema>;
export const OrderModel = model<Order>("Order", orderSchema);
