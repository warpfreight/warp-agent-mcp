import { z } from "zod";
// ── Shared ──────────────────────────────────────────────────────────
const zip = z.string().regex(/^\d{5}$/, "Must be a 5-digit US ZIP code");
const pickupDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD");
const accessorials = z
    .object({
    pickup: z.array(z.string()).optional(),
    delivery: z.array(z.string()).optional(),
})
    .optional();
// ── Quote inputs ────────────────────────────────────────────────────
export const VanQuoteInput = z.object({
    origin_zip: zip,
    destination_zip: zip,
    pallets: z.number().int().min(1).max(3),
    weight_lbs_per_pallet: z.number().min(50).max(3500),
    pickup_date: pickupDate,
    accessorials,
});
export const BoxTruckQuoteInput = z.object({
    origin_zip: zip,
    destination_zip: zip,
    pallets: z.number().int().min(1).max(12),
    weight_lbs_per_pallet: z.number().min(50).max(10000),
    pickup_date: pickupDate,
    accessorials,
});
export const FtlQuoteInput = z.object({
    origin_zip: zip,
    destination_zip: zip,
    pickup_date: pickupDate,
    pallets: z.number().int().min(1).max(26).optional(),
    weight_lbs_per_pallet: z.number().min(50).max(5000).optional(),
    accessorials,
});
export const LtlQuoteInput = z.object({
    origin_zip: zip,
    destination_zip: zip,
    pickup_date: pickupDate,
    pallets: z.number().int().min(1).max(26).optional(),
    weight_lbs_per_pallet: z.number().min(50).max(5000).optional(),
    commodity: z.string().optional(),
    length_in: z.number().positive().optional(),
    width_in: z.number().positive().optional(),
    height_in: z.number().positive().optional(),
    freight_class: z.string().optional(),
    stackable: z.boolean().optional(),
    hazmat: z.boolean().optional(),
    accessorials,
});
// ── Booking ─────────────────────────────────────────────────────────
export const BookInput = z.object({
    quote_id: z.string().startsWith("wq_"),
});
// ── Track / Cancel / List ───────────────────────────────────────────
export const TrackInput = z.object({
    booking_id: z.string(),
});
export const CancelInput = z.object({
    booking_id: z.string(),
});
//# sourceMappingURL=types.js.map