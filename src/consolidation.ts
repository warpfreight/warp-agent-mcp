/** Enrich the legacy FTL-only proposal with the canonical all-mode quotes.
 * No booking calls and no changes to the self-serve consolidation contract.
 */
type Row = Record<string, any>;
type QuoteClient = {
  consolidate(params: Record<string, unknown>): Promise<unknown>;
  allModesQuote(params: Record<string, unknown>): Promise<{ raw: Record<string, unknown>; dimsAssumed: boolean }>;
  ltlQuote(params: Record<string, unknown>): Promise<unknown>;
};
const modes: Record<string, string> = { cargo_van: 'van', box_truck: 'box-truck', ltl: 'ltl', ftl: 'ftl' };
const labels: Record<string, string> = { van: 'Cargo van', 'box-truck': "26' box truck", ltl: 'LTL (shared)', ftl: "53' dry van" };
const validPrice = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const cents = (n: number) => Math.round(n * 100) / 100;
const dims = (load: Row) => [load.length ?? 48, load.width ?? 40, load.height ?? 48];
const quoteInput = (load: Row) => ({
  origin_zip: load.origin_zip, destination_zip: load.destination_zip, pickup_date: load.pickup_date,
  pallets: load.pallets, weight_lbs_per_pallet: load.weight_lbs_per_pallet,
  length_in: dims(load)[0], width_in: dims(load)[1], height_in: dims(load)[2], stackable: false,
});

export async function consolidateWithModes(client: QuoteClient, params: Row): Promise<Row> {
  const data = await client.consolidate(params) as Row;
  if (!Array.isArray(data.proposals)) throw new Error('Consolidation returned no proposals array.');
  const proposals: Row[] = new Array(data.proposals.length);
  let next = 0;
  // At most two all-mode requests concurrently (each fans out to four modes).
  await Promise.all(Array.from({ length: Math.min(2, proposals.length) }, async () => {
    while (next < proposals.length) {
      const index = next++;
      const proposal = data.proposals[index] as Row;
      const output: Row = { ...proposal, original_ftl_comparison: proposal,
        comparison_scope: 'Combined Warp modes versus separate Warp LTL quotes; not an all-carrier comparison.' };
      proposals[index] = output;
      const incomplete = (reason: string) => Object.assign(output, {
        comparison_complete: false, pricing_note: reason,
        recommended: false, savings_usd: null, savings_pct: null,
      });
      const members = Array.isArray(proposal.loads)
        ? proposal.loads.map((l: Row) => params.loads?.[l.index]) : [];
      if (!members.length || members.some((l: Row | undefined) => !l)) {
        incomplete('Cannot match proposal members to the supplied loads. No savings recommendation.'); continue;
      }
      const first = members[0] as Row;
      // A scalar quote must never average away a heavy or oversized pallet.
      // Mixed manifests need item-aware pricing before a recommendation.
      if (members.some((l: Row) => JSON.stringify(dims(l)) !== JSON.stringify(dims(first)) || l.weight_lbs_per_pallet !== first.weight_lbs_per_pallet)) {
        incomplete('Mixed pallet dimensions or weights need item-level mode comparison. The original FTL-only estimate is retained for reference, not recommended.'); continue;
      }
      const assumed = members.some((l: Row) => l.length == null || l.width == null || l.height == null);
      try {
        const combinedInput = { ...quoteInput(first), pickup_date: proposal.pickup_date,
          pallets: members.reduce((sum: number, l: Row) => sum + l.pallets, 0) };
        const all = await client.allModesQuote(combinedInput);
        const rows = Array.isArray(all.raw.results) ? all.raw.results as Row[] : [];
        const alternatives: Row[] = rows.map((row: Row) => {
          const details = row.details ?? {};
          const requested = modes[row.mode] ?? row.mode;
          const served = modes[details.mode_substituted?.served] ?? details.service?.mode ?? requested;
          const available = row.available === true && validPrice(row.price_usd) && typeof row.quote_id === 'string' && row.quote_id.length > 0;
          return { mode: served, requested_mode: requested, available,
            ...(available ? { quote_id: row.quote_id, price_usd: row.price_usd,
              vehicle: served !== requested ? 'Dedicated truck (equipment assigned at dispatch)' : labels[served] ?? served,
              transit_days: row.transit_days ?? null, delivery_date: details.delivery_date ?? null,
              expires_at: row.expires_at ?? details.expires_at ?? null,
              quote_tier: assumed || all.dimsAssumed ? 'indicative' : details.quote_tier ?? 'indicative',
              missing_for_ship: details.missing_for_ship ?? [],
              ...(details.mode_substituted ? { mode_substituted: details.mode_substituted } : {}),
              pickup_date: proposal.pickup_date,
              book_tool_call: { tool: 'book', args: { quote_id: row.quote_id } },
            } : { reason: row.reason ?? 'No usable quote returned.' }),
          };
        });
        output.combined_options = alternatives;
        const priced = alternatives.filter((a) => a.available).sort((a, b) => a.price_usd - b.price_usd);
        if (!priced.length) { incomplete('No combined mode returned a usable quote. Original FTL comparison retained for reference.'); continue; }
        output.consolidated_truck = priced[0];
        output.comparison_complete = Object.keys(modes).every((mode) => rows.some((r) => r.mode === mode))
          && !rows.some((r) => r.available === true && (!validPrice(r.price_usd) || typeof r.quote_id !== 'string' || !r.quote_id))
          && !rows.some((r) => r.available !== true && /rate.?limit|quota|timeout|timed out|engine error|unauthor|temporar|retry|internal|failed/i.test(`${r.code ?? ''} ${r.reason ?? ''}`));
        // The legacy endpoint prices every pallet as 48x40x48 even when the
        // caller supplies dimensions. Reprice nonstandard members explicitly.
        let loads = proposal.loads as Row[];
        if (JSON.stringify(dims(first)) !== '[48,40,48]') {
          loads = [];
          for (let i = 0; i < members.length; i++) {
            const q = await client.ltlQuote(quoteInput(members[i])) as Row;
            loads.push({ ...proposal.loads[i], ltl_quote: q });
          }
          output.loads = loads;
        }
        const completeBaseline = loads.every((l) => validPrice(l.ltl_quote?.price_usd) && typeof l.ltl_quote?.quote_id === 'string');
        if (!completeBaseline) { incomplete('A separate-load LTL quote is missing. Combined options are shown, but no savings claimed.'); continue; }
        const separate = loads.reduce((sum, l) => sum + l.ltl_quote.price_usd, 0);
        const savings = cents(separate - priced[0].price_usd);
        Object.assign(output, { separate_ltl_total_usd: cents(separate), savings_usd: savings,
          savings_pct: separate > 0 ? Math.round(savings / separate * 1000) / 10 : null,
          recommended: output.comparison_complete && savings > 0,
          quote_tier: assumed || priced[0].quote_tier !== 'firm' ? 'indicative' : 'firm',
          pricing_note: output.comparison_complete
            ? 'Lowest returned combined Warp quote; unavailable modes remain listed. Separate baseline is Warp LTL, not the cheapest of all carriers. Confirm pickup-date changes and service requirements before booking.'
            : 'Some modes failed or did not return results. This is the lowest returned quote, not a complete mode comparison; retry before recommending.',
        });
      } catch {
        incomplete('Mode comparison or baseline repricing failed. Retry before recommending; the original FTL-only comparison is retained for reference.');
      }
    }
  }));
  const recommended = proposals.filter((p) => p.recommended);
  const total = cents(recommended.reduce((sum, p) => sum + p.savings_usd, 0));
  return { ...data, proposals, total_savings_usd: total,
    summary: `${recommended.length} consolidation proposal${recommended.length === 1 ? " has" : "s have"} a lower combined quote than separate Warp LTL; $${total.toFixed(2)} quoted difference.`,
    disclosure: 'Cluster fit uses non-stackable pallet positions and weight. Combined quotes come from the canonical all-mode engine; unavailable modes and incomplete comparisons are shown. Expiry is per quote. Missing dimensions remain indicative. This does not compare every carrier or authorize booking.',
  };
}
