import { InferSchemaType, Schema, model } from "mongoose";

// Audit log — no updates or deletes allowed.
const botInteractionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    intent: { type: String, required: true, trim: true },
    action: { type: String, required: true, trim: true },
    result: { type: String, trim: true },
  },
  { timestamps: true }
);

// Admin audit queries by time.
botInteractionSchema.index({ createdAt: -1 });

export type BotInteraction = InferSchemaType<typeof botInteractionSchema>;
export const BotInteractionModel = model<BotInteraction>("BotInteraction", botInteractionSchema);
