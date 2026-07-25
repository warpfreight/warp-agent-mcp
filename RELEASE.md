# Release runbook — 0.16.0 and the registry cleanup

Sequencing for the agent-platform backlog (Troy → Rahul, 2026-07-24). Order
matters: the registry must never reference an npm version that is not live, and
warp-site must never claim a tool count npm does not serve yet. Nothing below
happens automatically from this branch — every step is an explicit human action.

## 0. Preconditions (already true on this branch)

- `package.json` / `server.json` / `manifest.json` all read **0.16.0**; manifest
  tool list is generated from a live `tools/list` (26 tools, unprefixed).
- `server.json` carries the hosted remote
  (`remotes: [{type: streamable-http, url: https://mcp.wearewarp.com/api/mcp}]`)
  and a description whose first sentence says **quote** and **book**.
- Gate green: tsc 0, `npm test` green, 26/26 titled, 0 tools without a
  read-only/destructive annotation, nothing money-touching marked read-only.

## 1. Publish npm 0.16.0 (Rahul)

```bash
git checkout main && git merge feat/mode-compare-broker-brain
npm ci && npm run build && npm test
npm publish            # npm whoami → rahulharikumarr
npm view warp-agent-mcp version   # expect 0.16.0
```

## 2. Publish the registry entry (automatic on tag)

`.github/workflows/publish-mcp.yml` publishes `server.json` to
registry.modelcontextprotocol.io on any `v*` tag push, authenticating via GitHub
OIDC for the `io.github.warpfreight/*` namespace (no secret needed). It also
syncs the version field to the tag.

```bash
git tag v0.16.0 && git push origin v0.16.0
# verify (Troy's check):
curl -s "https://registry.modelcontextprotocol.io/v0/servers?search=freight" | python3 -m json.tool
```

## 3. Retire the two stale registry entries

The registry has no delete; deprecation = republish the same name with
`"status": "deprecated"`. Two entries, two different owners:

- **`com.wearewarp.www/freight` (0.0.4, the one that ranks first).** The
  namespace is claimed by domain proof, so republishing needs control of
  `wearewarp.com` — DNS TXT or an HTTP well-known file (`mcp-publisher login dns`
  / `login http`; Rahul can ship the well-known file through warp-site). Publish
  a minimal server.json under that name with `status: deprecated` and the
  description pointing at `io.github.warpfreight/warp-agent-mcp`.
- **`io.github.troy-lgtm/warp-agent-mcp` (0.5.63).** GitHub-namespace entry —
  only Troy's GitHub auth can touch it: `mcp-publisher login github`, then
  publish with `status: deprecated`. Ask Troy (one command, ~2 minutes).

Definition of done: the search above returns exactly one current Warp row.

## 4. Merge warp-site `fix/mcp-manifest-truth` — AFTER step 1

warp-site's manifest version comes from `scripts/sync-mcp-package-info.mjs`,
which queries **npm live** at build time — so the first deploy after `npm
publish` self-heals `/.well-known/mcp.json` to 0.16.0. The branch fixes the rest
(26 unprefixed tool names, `resources: 4` derived + build-guarded, 319 stale
name refs, `book_tool_call` naming a tool that exists). Merging it before npm
0.16.0 is live would make the site claim 26 tools while npm serves 25 — don't.

## 5. Deploy warp-mcp-remote keyless discovery — after Troy's step-4 sign-off

Branch `feat/keyless-discovery` in `warpfreight/warp-mcp-remote` (built, local).
Decision brief: `docs/keyless-discovery-decision.md` in that repo. Rollback is
env `ANON_DISCOVERY=0` (no redeploy of code, just env + redeploy). Verify with
Troy's curl — success is a tool list from `initialize`, not a 401.

## 6. Land warp-site PR #2799 (freight.json 0.2 + policies)

Review notes prepared separately. Verify after deploy:

```bash
curl -s https://www.wearewarp.com/.well-known/freight.json | python3 -m json.tool | head -40
```

## 7. Final verification (the backlog's definition of done)

```bash
npm view warp-agent-mcp version                                   # 0.16.0
curl -s "https://registry.modelcontextprotocol.io/v0/servers?search=freight" | python3 -m json.tool
curl -s https://www.wearewarp.com/.well-known/mcp.json | python3 -m json.tool | head -20
curl -s https://www.wearewarp.com/.well-known/freight.json | python3 -m json.tool | head -40
curl -s -X POST https://mcp.wearewarp.com/api/mcp \
  -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}'
```

Known deliberate deviation from the backlog: the all-modes tool is named
`compare_modes`, not `warp_compare_modes` — every wire name dropped the `warp_`
prefix in 0.15.0, and re-prefixing one tool of 26 would resurrect the
"warp warp_…" display bug the rename fixed. One-line change if overruled.
