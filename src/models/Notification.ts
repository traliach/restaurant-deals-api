import { InferSchemaType, Schema, model } from "mongoose";

// Events that trigger a notification.
const notificationSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    type: {
      type: String,
      enum: ["deal_approved", "deal_rejected", "order_status"],
      required: true,
    },
    message: { type: String, required: true, trim: true },
    read: { type: Boolean, default: false },
    dealId: { type: Schema.Types.ObjectId, ref: "Deal" },
    orderId: { type: Schema.Types.ObjectId, ref: "Order" },
  },
  { timestamps: true }
);

// Unread-first query by user.
notificationSchema.index({ userId: 1, createdAt: -1 });

export type Notification = InferSchemaType<typeof notificationSchema>;
export const NotificationModel = model<Notification>("Notification", notificationSchema);
