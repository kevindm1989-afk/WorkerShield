# WorkerShield

A mobile-first AI app for Ontario union stewards and JHSC co-chairs at Saputo Dairy Products Canada G.P. (Unifor Local 1285) and similar Ontario workplaces.

## Overview
A worker fills out a problem report. A 10-agent Anthropic Claude pipeline analyzes it against the actual Saputo/Unifor Local 1285 collective agreement and Ontario law (OHSA, ESA, OHRC, CBA, WSIA), then returns a single actionable response: legal position, immediate steps, documentation required, and escalation path.

## Architecture

### Artifacts
- `artifacts/api-server` — Express backend. Hosts the 10-agent pipeline at `POST /api/agent/run` (Server-Sent Events stream).
- `artifacts/workershield` — Expo / React Native mobile app (single-screen). Dark navy + gold "industrial union hall" theme.
- `artifacts/mockup-sandbox` — Vite-based component preview sandbox (default scaffold, unused).

### Agent Pipeline (Backend)
File: `artifacts/api-server/src/lib/agents.ts`

1. **Intake (CEO)** — runs first. Identifies legal issues, urgency, and outputs `SPECIALISTS: ...` line listing which specialists to dispatch.
2. **Specialists (parallel)** — any subset of: `ohsa`, `cba`, `esa`, `ohrc`, `evidence`, `email`, `mol`, `arbitration`. Each has a focused system prompt with statute references.
3. **QC** — quality control reviewer; flags incorrect statute citations (e.g. catches if O. Reg. 297/13 is wrongly cited for MSD/ergonomic matters) and consistency problems.
4. **Final** — compiles all outputs into one structured response (Executive Summary → Immediate Action → Legal Position → Management's Likely Move → Documentation → Escalation Path).

The full Saputo/Unifor Local 1285 CBA text is embedded in every agent's system context.

Endpoint: `POST /api/agent/run` (file `artifacts/api-server/src/routes/agent.ts`) — emits SSE events `agent_pending`, `agent_running`, `agent_done`, `complete`, `error`.

Model: `claude-sonnet-4-5`, max_tokens 1500. Uses the user's own `ANTHROPIC_API_KEY` env var directly (no Replit AI proxy).

### Mobile App
- Two-tab shell: `artifacts/workershield/app/index.tsx`
- SSE streaming consumer: `artifacts/workershield/lib/agentClient.ts` (uses `expo/fetch`)
- Markdown renderer: `artifacts/workershield/components/Markdown.tsx` + `lib/markdown.ts`
- Agent status chips with pulse animation: `artifacts/workershield/components/AgentChip.tsx`
- Theme: `artifacts/workershield/constants/colors.ts` — dark navy bg `#0B0F14`, gold accent `#D4A017`, sharp 4px border radius, Inter ExtraBold uppercase headings.

## Environment
- `ANTHROPIC_API_KEY` — required, used by the API server to call Claude.
- `SESSION_SECRET` — present, currently unused.

## Conventions
- No O. Reg. 297/13 citations for MSD / ergonomic / equipment matters (it is a TRAINING regulation only). The QC agent enforces this.
- CBA Article 5.02 (steward present at investigatory interviews), 5.03 (5-day discipline-copy rule renders discipline null and void), 5.05 (12-month sunset, 24 months for harassment) are recurring critical rules.
- OHSA s.8(14) JHSC inspector referrals have NO time limit after employer written refusal — never invent one.
