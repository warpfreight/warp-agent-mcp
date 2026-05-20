// src/policy.ts
export const EXCLUDED_COMMODITIES = [
    'frozen', 'refrigerated', 'reefer', 'perishable', 'produce', 'dairy',
    'meat', 'seafood', 'fish', 'ice cream', 'flowers', 'pharma cold-chain',
    'temperature-controlled', 'cold chain', 'fresh', 'strawberr', 'lettuce',
    'vegetables', 'fruit', 'poultry', 'beef', 'pork', 'lamb',
];
export function checkCommodity(commodity) {
    if (!commodity)
        return null;
    const lower = commodity.toLowerCase();
    for (const term of EXCLUDED_COMMODITIES) {
        if (lower.includes(term)) {
            return `Warp does not service temperature-controlled or perishable freight. Warp's network is ambient and shelf-stable only. Please use a reefer or cold-chain carrier for this shipment.`;
        }
    }
    return null;
}
export function coverageGapRefusal(originZip, destZip) {
    return `Warp does not have direct coverage on this lane (${originZip} → ${destZip}) right now. A Warp rep can work on a custom solution — contact support@wearewarp.com with your lane details.`;
}
export const CANADA_POLICY = `Warp services Canada cross-border via FTL only. LTL cross-border is not available. The customer is responsible for customs clearance, commercial invoice, USMCA qualification, and duties. PARS (CA side) and PAPS (US side) are coordinated by the carrier.`;
export function isCanadianPostal(zip) {
    // Canadian postal codes: A1A 1A1 or A1A1A1 (6 chars alphanumeric)
    return /^[A-Za-z]\d[A-Za-z][\s]?\d[A-Za-z]\d$/.test(zip.trim());
}
//# sourceMappingURL=policy.js.map