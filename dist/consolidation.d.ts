/** Enrich the legacy FTL-only proposal with the canonical all-mode quotes.
 * No booking calls and no changes to the self-serve consolidation contract.
 */
type Row = Record<string, any>;
type QuoteClient = {
    consolidate(params: Record<string, unknown>): Promise<unknown>;
    allModesQuote(params: Record<string, unknown>): Promise<{
        raw: Record<string, unknown>;
        dimsAssumed: boolean;
    }>;
    ltlQuote(params: Record<string, unknown>): Promise<unknown>;
};
export declare function consolidateWithModes(client: QuoteClient, params: Row): Promise<Row>;
export {};
