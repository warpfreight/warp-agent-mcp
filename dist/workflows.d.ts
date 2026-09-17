import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
export declare const workflows: {
    shipment_intake: string;
    weekly_freight_review: string;
    invoice_review: string;
};
export declare const comparisonRow: z.ZodObject<{
    shipment_id: z.ZodString;
    baseline_amount_usd: z.ZodEffects<z.ZodNumber, number, number>;
    candidate_amount_usd: z.ZodEffects<z.ZodNumber, number, number>;
    baseline_source: z.ZodString;
    candidate_source: z.ZodString;
    baseline_kind: z.ZodEnum<["historical_invoice", "current_quote"]>;
    candidate_kind: z.ZodEnum<["quote", "final_invoice"]>;
    shipment_requirements: z.ZodEnum<["matched", "different", "unknown"]>;
    included_charges: z.ZodEnum<["matched", "different", "unknown"]>;
    service_requirements: z.ZodEnum<["matched", "different", "unknown"]>;
    comparison_evidence: z.ZodString;
}, "strip", z.ZodTypeAny, {
    shipment_id: string;
    baseline_amount_usd: number;
    candidate_amount_usd: number;
    baseline_source: string;
    candidate_source: string;
    baseline_kind: "historical_invoice" | "current_quote";
    candidate_kind: "quote" | "final_invoice";
    shipment_requirements: "unknown" | "matched" | "different";
    included_charges: "unknown" | "matched" | "different";
    service_requirements: "unknown" | "matched" | "different";
    comparison_evidence: string;
}, {
    shipment_id: string;
    baseline_amount_usd: number;
    candidate_amount_usd: number;
    baseline_source: string;
    candidate_source: string;
    baseline_kind: "historical_invoice" | "current_quote";
    candidate_kind: "quote" | "final_invoice";
    shipment_requirements: "unknown" | "matched" | "different";
    included_charges: "unknown" | "matched" | "different";
    service_requirements: "unknown" | "matched" | "different";
    comparison_evidence: string;
}>;
export declare const comparisonInput: z.ZodEffects<z.ZodObject<{
    rows: z.ZodArray<z.ZodObject<{
        shipment_id: z.ZodString;
        baseline_amount_usd: z.ZodEffects<z.ZodNumber, number, number>;
        candidate_amount_usd: z.ZodEffects<z.ZodNumber, number, number>;
        baseline_source: z.ZodString;
        candidate_source: z.ZodString;
        baseline_kind: z.ZodEnum<["historical_invoice", "current_quote"]>;
        candidate_kind: z.ZodEnum<["quote", "final_invoice"]>;
        shipment_requirements: z.ZodEnum<["matched", "different", "unknown"]>;
        included_charges: z.ZodEnum<["matched", "different", "unknown"]>;
        service_requirements: z.ZodEnum<["matched", "different", "unknown"]>;
        comparison_evidence: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        shipment_id: string;
        baseline_amount_usd: number;
        candidate_amount_usd: number;
        baseline_source: string;
        candidate_source: string;
        baseline_kind: "historical_invoice" | "current_quote";
        candidate_kind: "quote" | "final_invoice";
        shipment_requirements: "unknown" | "matched" | "different";
        included_charges: "unknown" | "matched" | "different";
        service_requirements: "unknown" | "matched" | "different";
        comparison_evidence: string;
    }, {
        shipment_id: string;
        baseline_amount_usd: number;
        candidate_amount_usd: number;
        baseline_source: string;
        candidate_source: string;
        baseline_kind: "historical_invoice" | "current_quote";
        candidate_kind: "quote" | "final_invoice";
        shipment_requirements: "unknown" | "matched" | "different";
        included_charges: "unknown" | "matched" | "different";
        service_requirements: "unknown" | "matched" | "different";
        comparison_evidence: string;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    rows: {
        shipment_id: string;
        baseline_amount_usd: number;
        candidate_amount_usd: number;
        baseline_source: string;
        candidate_source: string;
        baseline_kind: "historical_invoice" | "current_quote";
        candidate_kind: "quote" | "final_invoice";
        shipment_requirements: "unknown" | "matched" | "different";
        included_charges: "unknown" | "matched" | "different";
        service_requirements: "unknown" | "matched" | "different";
        comparison_evidence: string;
    }[];
}, {
    rows: {
        shipment_id: string;
        baseline_amount_usd: number;
        candidate_amount_usd: number;
        baseline_source: string;
        candidate_source: string;
        baseline_kind: "historical_invoice" | "current_quote";
        candidate_kind: "quote" | "final_invoice";
        shipment_requirements: "unknown" | "matched" | "different";
        included_charges: "unknown" | "matched" | "different";
        service_requirements: "unknown" | "matched" | "different";
        comparison_evidence: string;
    }[];
}>, {
    rows: {
        shipment_id: string;
        baseline_amount_usd: number;
        candidate_amount_usd: number;
        baseline_source: string;
        candidate_source: string;
        baseline_kind: "historical_invoice" | "current_quote";
        candidate_kind: "quote" | "final_invoice";
        shipment_requirements: "unknown" | "matched" | "different";
        included_charges: "unknown" | "matched" | "different";
        service_requirements: "unknown" | "matched" | "different";
        comparison_evidence: string;
    }[];
}, {
    rows: {
        shipment_id: string;
        baseline_amount_usd: number;
        candidate_amount_usd: number;
        baseline_source: string;
        candidate_source: string;
        baseline_kind: "historical_invoice" | "current_quote";
        candidate_kind: "quote" | "final_invoice";
        shipment_requirements: "unknown" | "matched" | "different";
        included_charges: "unknown" | "matched" | "different";
        service_requirements: "unknown" | "matched" | "different";
        comparison_evidence: string;
    }[];
}>;
export declare function compareFreightCosts(input: unknown): {
    currency: string;
    basis: string;
    comparisons: {
        comparison_status: string;
        difference_type: string;
        cost_difference_usd: number | null;
        cost_difference_percent: number | null;
        outcome: string;
        shipment_id: string;
        baseline_amount_usd: number;
        candidate_amount_usd: number;
        baseline_source: string;
        candidate_source: string;
        baseline_kind: "historical_invoice" | "current_quote";
        candidate_kind: "quote" | "final_invoice";
        shipment_requirements: "unknown" | "matched" | "different";
        included_charges: "unknown" | "matched" | "different";
        service_requirements: "unknown" | "matched" | "different";
        comparison_evidence: string;
    }[];
    totals: {
        difference_type: string;
        comparable_shipments: number;
        net_cost_difference_usd: number | null;
    }[];
    excluded_shipments: number;
    note: string;
};
export declare function registerWorkflows(server: McpServer): void;
