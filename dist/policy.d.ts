export declare const EXCLUDED_COMMODITIES: string[];
export declare function checkCommodity(commodity?: string): string | null;
export declare function coverageGapRefusal(originZip: string, destZip: string): string;
export declare const CANADA_POLICY = "Warp services Canada cross-border via FTL only. LTL cross-border is not available. The customer is responsible for customs clearance, commercial invoice, USMCA qualification, and duties. PARS (CA side) and PAPS (US side) are coordinated by the carrier.";
export declare function isCanadianPostal(zip: string): boolean;
