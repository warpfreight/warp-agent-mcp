import { z } from "zod";
export declare const VanQuoteInput: z.ZodObject<{
    origin_zip: z.ZodString;
    destination_zip: z.ZodString;
    pallets: z.ZodNumber;
    weight_lbs_per_pallet: z.ZodNumber;
    pickup_date: z.ZodString;
    accessorials: z.ZodOptional<z.ZodObject<{
        pickup: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        delivery: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    }, "strip", z.ZodTypeAny, {
        pickup?: string[] | undefined;
        delivery?: string[] | undefined;
    }, {
        pickup?: string[] | undefined;
        delivery?: string[] | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    origin_zip: string;
    destination_zip: string;
    pickup_date: string;
    pallets: number;
    weight_lbs_per_pallet: number;
    accessorials?: {
        pickup?: string[] | undefined;
        delivery?: string[] | undefined;
    } | undefined;
}, {
    origin_zip: string;
    destination_zip: string;
    pickup_date: string;
    pallets: number;
    weight_lbs_per_pallet: number;
    accessorials?: {
        pickup?: string[] | undefined;
        delivery?: string[] | undefined;
    } | undefined;
}>;
export declare const BoxTruckQuoteInput: z.ZodObject<{
    origin_zip: z.ZodString;
    destination_zip: z.ZodString;
    pallets: z.ZodNumber;
    weight_lbs_per_pallet: z.ZodNumber;
    pickup_date: z.ZodString;
    accessorials: z.ZodOptional<z.ZodObject<{
        pickup: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        delivery: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    }, "strip", z.ZodTypeAny, {
        pickup?: string[] | undefined;
        delivery?: string[] | undefined;
    }, {
        pickup?: string[] | undefined;
        delivery?: string[] | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    origin_zip: string;
    destination_zip: string;
    pickup_date: string;
    pallets: number;
    weight_lbs_per_pallet: number;
    accessorials?: {
        pickup?: string[] | undefined;
        delivery?: string[] | undefined;
    } | undefined;
}, {
    origin_zip: string;
    destination_zip: string;
    pickup_date: string;
    pallets: number;
    weight_lbs_per_pallet: number;
    accessorials?: {
        pickup?: string[] | undefined;
        delivery?: string[] | undefined;
    } | undefined;
}>;
export declare const FtlQuoteInput: z.ZodObject<{
    origin_zip: z.ZodString;
    destination_zip: z.ZodString;
    pickup_date: z.ZodString;
    pallets: z.ZodOptional<z.ZodNumber>;
    weight_lbs_per_pallet: z.ZodOptional<z.ZodNumber>;
    accessorials: z.ZodOptional<z.ZodObject<{
        pickup: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        delivery: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    }, "strip", z.ZodTypeAny, {
        pickup?: string[] | undefined;
        delivery?: string[] | undefined;
    }, {
        pickup?: string[] | undefined;
        delivery?: string[] | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    origin_zip: string;
    destination_zip: string;
    pickup_date: string;
    pallets?: number | undefined;
    weight_lbs_per_pallet?: number | undefined;
    accessorials?: {
        pickup?: string[] | undefined;
        delivery?: string[] | undefined;
    } | undefined;
}, {
    origin_zip: string;
    destination_zip: string;
    pickup_date: string;
    pallets?: number | undefined;
    weight_lbs_per_pallet?: number | undefined;
    accessorials?: {
        pickup?: string[] | undefined;
        delivery?: string[] | undefined;
    } | undefined;
}>;
export declare const LtlQuoteInput: z.ZodObject<{
    origin_zip: z.ZodString;
    destination_zip: z.ZodString;
    pickup_date: z.ZodString;
    pallets: z.ZodOptional<z.ZodNumber>;
    weight_lbs_per_pallet: z.ZodOptional<z.ZodNumber>;
    commodity: z.ZodOptional<z.ZodString>;
    length_in: z.ZodOptional<z.ZodNumber>;
    width_in: z.ZodOptional<z.ZodNumber>;
    height_in: z.ZodOptional<z.ZodNumber>;
    freight_class: z.ZodOptional<z.ZodString>;
    stackable: z.ZodOptional<z.ZodBoolean>;
    hazmat: z.ZodOptional<z.ZodBoolean>;
    accessorials: z.ZodOptional<z.ZodObject<{
        pickup: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        delivery: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    }, "strip", z.ZodTypeAny, {
        pickup?: string[] | undefined;
        delivery?: string[] | undefined;
    }, {
        pickup?: string[] | undefined;
        delivery?: string[] | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    origin_zip: string;
    destination_zip: string;
    pickup_date: string;
    pallets?: number | undefined;
    weight_lbs_per_pallet?: number | undefined;
    commodity?: string | undefined;
    freight_class?: string | undefined;
    hazmat?: boolean | undefined;
    stackable?: boolean | undefined;
    length_in?: number | undefined;
    width_in?: number | undefined;
    height_in?: number | undefined;
    accessorials?: {
        pickup?: string[] | undefined;
        delivery?: string[] | undefined;
    } | undefined;
}, {
    origin_zip: string;
    destination_zip: string;
    pickup_date: string;
    pallets?: number | undefined;
    weight_lbs_per_pallet?: number | undefined;
    commodity?: string | undefined;
    freight_class?: string | undefined;
    hazmat?: boolean | undefined;
    stackable?: boolean | undefined;
    length_in?: number | undefined;
    width_in?: number | undefined;
    height_in?: number | undefined;
    accessorials?: {
        pickup?: string[] | undefined;
        delivery?: string[] | undefined;
    } | undefined;
}>;
export declare const BookInput: z.ZodObject<{
    quote_id: z.ZodString;
}, "strip", z.ZodTypeAny, {
    quote_id: string;
}, {
    quote_id: string;
}>;
export declare const TrackInput: z.ZodObject<{
    booking_id: z.ZodString;
}, "strip", z.ZodTypeAny, {
    booking_id: string;
}, {
    booking_id: string;
}>;
export declare const CancelInput: z.ZodObject<{
    booking_id: z.ZodString;
}, "strip", z.ZodTypeAny, {
    booking_id: string;
}, {
    booking_id: string;
}>;
export type VanQuoteParams = z.infer<typeof VanQuoteInput>;
export type BoxTruckQuoteParams = z.infer<typeof BoxTruckQuoteInput>;
export type FtlQuoteParams = z.infer<typeof FtlQuoteInput>;
export type LtlQuoteParams = z.infer<typeof LtlQuoteInput>;
export type BookParams = z.infer<typeof BookInput>;
export type TrackParams = z.infer<typeof TrackInput>;
export type CancelParams = z.infer<typeof CancelInput>;
