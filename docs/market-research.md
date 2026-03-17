# Market Research: Agent-Trade — AI Trading Infrastructure
*Research date: March 2026 | Analyst: Claw (System Administrator / Research Run)*

---

## 1. Market Landscape

### 1.1 Who's Building AI Trading Agents?

The AI trading agent space is rapidly maturing across three main layers:

#### Infrastructure / Protocol Layer
- **Virtuals Protocol** — dominant AI agent ecosystem ($246M FDV), Genesis launchpad for agent tokens; agents can collaborate autonomously
- **ElizaOS (ai16z)** — open-source AI agent framework widely used for trading agent deployment
- **Swarms** — enterprise multi-agent framework (45M agents deployed); strong tech, limited market traction
- **QuantConnect** — institutional-grade algo trading platform, $45B notional/month; now integrating agentic AI ("Mia")

#### MCP Server / Tool Layer (most relevant for agent-trade)
- **agent-trade** (this project) — multi-venue MCP server (Polymarket + Whales Market)
- **Polymarket MCP** (mcpmarket.com listing) — standalone Polymarket connector
- **Agora MCP** — AI-only prediction market (agents trade play money); early stage
- **RSS3 MCP Server** — news scanning + trade execution for prediction markets
- **PolyBro, Billy Bets, Semantic 42** — autonomous trading agents (not MCP, bespoke)

#### Prediction Market Platforms
| Platform | 2025 Volume | Market Share | Chain | Regulatory |
|----------|-------------|--------------|-------|------------|
| Kalshi | $23.8B | ~55% | US (CFTC) | Fully regulated |
| Polymarket | $22B | ~42% | Polygon | Crypto-native |
| Others (Azuro, Manifold, etc.) | $1.25B | ~3% | Various | Mixed |
| **Total** | **~$47B** | — | — | — |

**Key stat:** AI agents now contribute **30%+ of total prediction market volume** (Jan 2026, $5.9B weekly).

#### DEX Aggregators (adjacent market)
- 1inch, Paraswap, 0x processed **$1T+ in 2024**; DEX-to-CEX ratio hit 25% in May 2025
- Aggregators earn 0.1–0.3% per trade; multi-venue routing = core value prop → directly validates agent-trade's multi-venue approach

### 1.2 Market Size & Growth

| Segment | 2024 | 2025 | 2026 Projected | Growth |
|---------|------|------|----------------|--------|
| Prediction Markets (total volume) | ~$9B | ~$47B | $222.5B (Piper Sandler) | +400% YoY 2024→2025 |
| Pre-market / OTC (Whales Market) | — | $339M+ cumulative | Growing | Pioneer category |
| DEX aggregation | ~$1T | Higher | — | +66% on-chain Q1 2025 |
| AI agent trading infrastructure | Nascent | Emerging | Large | Explosive |

**Bottom line:** Prediction markets are at "financial futures in 1982" stage — established but pre-mass-institutional. The $222.5B 2026 projection = massive headroom. AI agents doing 30% of volume = the infrastructure layer (agent-trade's position) is essential.

### 1.3 Competitor Analysis

#### Direct Competitors (MCP trading servers)
| Tool | Venues | Approach | Moat | Weakness |
|------|--------|----------|------|----------|
| **agent-trade** | Polymarket + Whales Market | Universal multi-venue MCP | Multi-venue, safety built-in, open-source | Early stage, limited venues |
| Polymarket MCP (mcpmarket.com) | Polymarket only | Single-venue connector | First-mover on PM | Single venue, no safety layer |
| PolyBro | Polymarket | Research-driven autonomous agent | Academic data ingestion | Not MCP, not portable |
| Billy Bets | Sports (Polymarket) | 24/7 autonomous | Sports niche focus | Bespoke, no portability |
| Semantic 42 | Base chain | AGI solver engine | On-chain native | Single chain, niche |

#### Adjacent Competitors
| Tool | Type | Notes |
|------|------|-------|
| QuantConnect + Mia | Algo trading + AI | TradFi focus, $45B/month; not prediction markets |
| Virtuals Protocol | Agent ecosystem | Ecosystem play, not infrastructure |
| Agora MCP | Agent-only prediction market | Play money, early stage |
| MoltMarkets | Agent trading platform | 8 agents, 266 markets — very early |

**Competitive gap:** No universal, multi-venue, safety-first MCP trading server exists. agent-trade is first-mover in this exact niche.

---

## 2. Business Model Canvas

### Customer Segments
1. **AI agent builders** — devs integrating Claude/GPT/OpenClaw with trading capabilities
2. **Quant teams going AI-first** — replacing algo bots with LLM agents
3. **Crypto traders using AI assistants** — Claude Desktop / Cursor power users wanting 1-click trading
4. **Research agents** — AI systems needing real-time market data (read-only, zero config)

### Value Propositions
- **Zero-config read access** — no API keys, works instantly → lowers friction to zero
- **Universal protocol** — one MCP server, multiple venues; add venue by connecting new adapter
- **Safety built-in** — spend limits, sanity checks, persistent tracking → enterprise-safe
- **Agent-first design** — autonomous signing, multi-chain (Solana + 20+ EVM)
- **Open source** — GitHub as product; README as landing page

### Revenue Streams (recommended)

| Model | Description | Target | Timing |
|-------|-------------|--------|--------|
| **Freemium (read free, trade paid)** | Read-only = free forever; trading features unlock with API key / subscription | All segments | Now |
| **SaaS subscription** | $29–$99/mo for hosted, managed agent-trade instance + monitoring dashboard | Individual devs, quant teams | Phase 2 |
| **Transaction fee** | 0.1–0.2% on trade volume routed through agent-trade (vs. 0% direct) | High-volume traders | Phase 3 |
| **Enterprise licensing** | White-label + compliance layer for hedge funds / institutions | Institutions | Phase 4 |
| **Data / API** | Aggregated market intelligence API to quant funds | B2B | Phase 3+ |

**Benchmark:** DEX aggregators charge 0.1–0.3%. At 1% of Polymarket's $22B annual volume = $22M TAM just from fee capture on prediction markets.

### Channels
- **GitHub** (primary) — open source = distribution; stars = trust signal; README = landing page
- **MCP registries** — mcpmarket.com listing already exists
- **ClawHub** — OpenClaw ecosystem distribution (`clawhub install agent-trade`)
- **Claude Desktop / Cursor MCP configs** — npx one-liner = zero-friction install
- **Community** — MCP Discord, AI agent builder forums, Polymarket Discord

### Cost Structure
| Cost | Estimate | Notes |
|------|----------|-------|
| Infra (self-hosted, current) | ~$0 | stdio mode, runs on user machine |
| Infra (hosted SaaS) | $3–5K/mo (dev), $30–50K/mo (prod) | AI agent infra standard |
| LLM API (if used) | Variable | Agent-trade itself doesn't use LLM — minimal cost |
| Compliance / legal | $10–50K/yr | Grows with enterprise tier |
| Team | Founder-led for now | Scales with revenue |

**Key advantage:** stdio MCP mode = zero infra cost until SaaS phase. Margins are exceptional in Phase 1–2.

---

## 3. Competitor Matrix

| | agent-trade | Polymarket MCP | PolyBro | QuantConnect + Mia | Virtuals |
|---|---|---|---|---|---|
| **Multi-venue** | ✅ | ❌ | ❌ | ✅ (TradFi) | ❌ |
| **MCP compatible** | ✅ | ✅ | ❌ | ❌ | ❌ |
| **Open source** | ✅ | Unknown | ❌ | Partial | ❌ |
| **Prediction markets** | ✅ | ✅ | ✅ | ❌ | ❌ |
| **Pre-market / OTC** | ✅ (Whales) | ❌ | ❌ | ❌ | ❌ |
| **Safety / spend limits** | ✅ | ❌ | Unknown | ✅ | ❌ |
| **Zero-config read** | ✅ | Partial | ❌ | ❌ | ❌ |
| **Agent Mode (auto-sign)** | ✅ | ❌ | ✅ | ❌ | ✅ |
| **Multi-chain** | ✅ (Solana + 20+ EVM) | ❌ (Polygon only) | ❌ | ❌ | ❌ |
| **Adapter pattern (extensible)** | ✅ | ❌ | ❌ | ✅ | ❌ |

**Summary:** agent-trade has the strongest feature set in the MCP trading server niche. No direct equivalent exists. Nearest competitor (Polymarket MCP) is single-venue with no safety layer.

---

## 4. Agent-First Future

### Thesis Alignment (Lab3 9 Predictions)

**Prediction #2 — Agent-First World:**
- AI agents now do **30%+ of prediction market volume** ($5.9B weekly × 30% = $1.77B/week from agents)
- Best arbitrage bot: $313 → $414,000 in one month; AI probabilistic model: $2.2M profit in two months
- Agent-trade is **infrastructure layer** for this wave — picks, shovels for the gold rush

**Prediction #3 — GitHub = AppStore:**
- agent-trade distribution model validates this: `npx -y agent-trade` = zero-install
- README as landing page → ClawHub install → MCP registry listing
- Stars/forks are the conversion metric, not App Store ratings

**Prediction #6 — All Software = Legacy:**
- Traditional trading bots (QuantConnect, custom algo) = legacy if not MCP-compatible
- agent-trade is natively agent-first → not retrofitting, building from scratch

### Timeline Projection
| Horizon | State |
|---------|-------|
| **Now (2026)** | AI agents = 30% of prediction market volume; MCP ecosystem exploding |
| **2027–2028** | Consumer: personal agent wallets common; agent-to-agent trading = normal; every Claude user has trading capability via MCP |
| **2030+** | Enterprise: institutional AI agents dominate volume; agent-trade enterprise tier is critical infrastructure |

**Prediction:** When personal agents are mainstream (~2027), agent-trade's install base grows passively — every new Claude Desktop user is a potential user. Infrastructure plays compound.

---

## 5. Go-to-Market Recommendation

### Phase 0 — NOW (Week 1–2): Distribution Foundation
- [ ] Publish to npm (`npm publish`) — enables `npx -y agent-trade`
- [ ] Polish README: add GIF demo, quick-start config blocks per platform (Claude Desktop, Cursor, OpenClaw)
- [ ] Submit to MCP registries: mcpmarket.com, mcp.so, glama.ai
- [ ] ClawHub publish: `clawhub publish` → immediate OpenClaw ecosystem reach
- [ ] Polymarket Discord + MCP Discord: post announcement, link repo

### Phase 1 — Month 1–2: First 100 Users
**Target:** AI agent builders on GitHub, Claude Desktop power users

- Community seeding: post in r/ClaudeAI, r/singularity, Hacker News Show HN
- Influencer: find 2–3 AI trading YouTubers / X accounts, send DMs with demo setup
- Integration: write integration guide for OpenClaw (mcporter add agent-trade)
- Metrics: GitHub stars (target 500), npm weekly downloads (target 1K), Discord members

### Phase 2 — Month 3–6: Monetization + Venue Expansion
**Target:** Convert power users to paying; add 2–3 venues

- Launch hosted tier ($29/mo) — managed instance + dashboard + alerts
- Add Kalshi adapter (CFTC-regulated = institutional credibility)
- Add Manifold adapter (play money = safe testing ground for new features)
- Explore Robinhood prediction market API (20% market share, massive retail user base)

### Phase 3 — Month 6–12: Enterprise + Data
**Target:** Quant teams, hedge funds, institutional

- Enterprise licensing: white-label + SLA + compliance reporting
- Data API: aggregate market intelligence, sell to quant funds
- Partnership: integrate with QuantConnect, Axelrod, or similar algo platforms
- PR / media: trade press (CoinDesk, The Block, Bloomberg Crypto)

### Key Metrics to Track
| Metric | Phase 0 Target | Phase 1 Target | Phase 2 Target |
|--------|---------------|---------------|---------------|
| GitHub stars | 100 | 500 | 2,000 |
| npm weekly downloads | — | 1,000 | 10,000 |
| MRR | $0 | $0 | $5K |
| Venues supported | 2 | 2 | 5 |
| Discord members | 50 | 500 | 2,000 |

---

## Summary

**agent-trade is well-positioned.** The market is at an inflection point: prediction markets grew 400%+ YoY, AI agents drive 30% of volume, and no universal multi-venue MCP trading server exists. The moat is adapter extensibility + safety layer + zero-config reads. The path: open-source distribution first → community → hosted SaaS → enterprise. The timing is right: MCP ecosystem is exploding (13,729+ skills on ClawHub), and agent-first infrastructure is the hottest category in AI tooling.

*Prepared for JOO-36 | agent-trade project | March 2026*
