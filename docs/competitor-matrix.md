# Competitor Matrix — agent-trade
*March 2026*

## Direct Competitors (MCP Trading Servers)

| | **agent-trade** | Polymarket MCP | PolyBro | RSS3 MCP |
|---|---|---|---|---|
| **Venues** | Polymarket + Whales Market (extensible) | Polymarket only | Polymarket only | News → Prediction markets |
| **MCP compatible** | ✅ | ✅ | ❌ | ✅ |
| **Multi-venue** | ✅ | ❌ | ❌ | Partial |
| **Open source** | ✅ | Unknown | ❌ | ❌ |
| **Safety / spend limits** | ✅ | ❌ | Unknown | ❌ |
| **Agent Mode (auto-sign)** | ✅ | ❌ | ✅ | ❌ |
| **Zero-config reads** | ✅ | Partial | ❌ | ❌ |
| **Multi-chain** | ✅ (Solana + 20+ EVM) | ❌ (Polygon) | ❌ | ❌ |
| **Adapter pattern** | ✅ | ❌ | ❌ | ❌ |
| **Pre-market / OTC** | ✅ (Whales) | ❌ | ❌ | ❌ |

## Adjacent Competitors (Broader Trading AI)

| | **agent-trade** | QuantConnect + Mia | Virtuals Protocol | Axelrod | BasisOS |
|---|---|---|---|---|---|
| **Type** | MCP server | Algo platform | Agent ecosystem | AI hedge fund | Yield optimizer |
| **Prediction markets** | ✅ | ❌ | ❌ | ❌ | ❌ |
| **MCP compatible** | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Portability (any LLM)** | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Open source** | ✅ | Partial | ❌ | ❌ | ❌ |
| **Revenue (est.)** | Pre-revenue | $45B/mo volume | Token-based | Token-based | Token-based |
| **Agent-first** | ✅ | Retrofitting | ✅ | ✅ | ✅ |

## Prediction Market Platforms (Venues, Not Competitors)

| Platform | 2025 Volume | AI Agent % | Key for agent-trade |
|----------|-------------|-----------|---------------------|
| Kalshi | $23.8B | ~30% | Next venue to add (CFTC regulated) |
| Polymarket | $22B | ~30% | ✅ Already supported |
| Whales Market | $339M+ cumul. | Growing | ✅ Already supported |
| Manifold | Small | Active bot dev | Good for testing/prototyping |
| Robinhood (new) | ~20% mkt share | — | Future venue candidate |

## Competitive Moats

### agent-trade Moats
1. **Adapter architecture** — adding a venue is implementing one TypeScript interface; competitors can't match extensibility
2. **Safety layer** — spend limits + sanity checks = enterprise-safe; no competitor has this
3. **Multi-chain** — Solana + 20+ EVM in one server; covers both Polymarket (Polygon) and Whales (Solana)
4. **Zero-config reads** — lowest friction in market; read data with zero setup
5. **First-mover** — first universal multi-venue MCP trading server in the market

### Competitor Moats
- **Polymarket MCP**: First-mover on Polymarket specifically; established mcpmarket.com listing
- **QuantConnect**: $45B/mo volume; institutional relationships; deep backtesting infrastructure
- **Virtuals Protocol**: Network effects in AI agent ecosystem; token economics

## Gaps in the Market (Opportunities)

1. **Kalshi adapter** — CFTC-regulated, institutional credibility, fastest growing platform → highest priority next venue
2. **Sports prediction** — Kalshi's 90% volume is sports; massive underserved segment
3. **Intent-based trading** — user says "bet on Fed keeping rates" → agent-trade resolves to best market automatically
4. **Portfolio tracking** — unified view across all venues; no competitor offers cross-venue portfolio
5. **Backtesting integration** — connect agent-trade to QuantConnect for strategy validation

*Prepared for JOO-36 | agent-trade project | March 2026*
