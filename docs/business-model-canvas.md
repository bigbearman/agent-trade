# Business Model Canvas — agent-trade
*March 2026*

## Key Partners
- Polymarket (venue + API)
- Whales Market (venue + API)
- Anthropic / OpenAI (LLM platforms distributing via MCP)
- ClawHub / OpenClaw ecosystem
- MCP registry platforms (mcpmarket.com, mcp.so)

## Key Activities
- Maintain & expand venue adapters
- MCP protocol compliance + SDK updates
- Safety system (spend limits, sanity checks)
- Community & developer relations
- Documentation & tutorials

## Key Resources
- Open-source codebase (GitHub)
- Adapter pattern architecture (moat = extensibility)
- Safety layer (trust signal for enterprise)
- Multi-chain wallet system

## Value Propositions
| For | Proposition |
|-----|------------|
| Agent builders | One MCP server → trade any venue; works in Claude/GPT/any MCP client |
| Read-only users | Zero config, instant market data, no API keys |
| Autonomous agents | Agent Mode with safe spend limits; wallet never exposed |
| Enterprise | Safety-first, white-label, compliance-ready |

## Customer Relationships
- Self-serve (stdio MCP)
- Community Discord
- GitHub Issues / PRs
- Managed SaaS (Phase 2)
- Enterprise SLA (Phase 3)

## Channels
- GitHub (primary distribution)
- `npx -y agent-trade` (zero-friction install)
- ClawHub registry
- MCP marketplaces
- Claude Desktop / Cursor config snippets

## Customer Segments
1. AI agent builders (primary)
2. Claude Desktop / Cursor power users
3. Quant teams adopting AI
4. Crypto traders using AI assistants
5. Enterprise / hedge funds (future)

## Cost Structure
| Phase | Monthly Cost |
|-------|-------------|
| Phase 1 (open source, stdio) | ~$0 infra |
| Phase 2 (hosted SaaS) | $3–5K dev, $30–50K prod |
| Phase 3 (enterprise) | $50–100K+ (compliance, sales) |

Primary costs: engineering time, infra (Phase 2+), compliance (Phase 3+)

## Revenue Streams
| Stream | Model | When |
|--------|-------|------|
| Freemium / OSS | Read-only free forever | Now |
| SaaS subscription | $29–$99/mo hosted instance | Phase 2 |
| Transaction fees | 0.1–0.2% on trade volume | Phase 3 |
| Enterprise licensing | $10K–100K/yr white-label | Phase 3+ |
| Data API | B2B market intelligence | Phase 3+ |

## Key Metrics
- GitHub stars / forks
- npm weekly downloads
- Active venues connected
- Monthly trade volume routed
- MRR (Phase 2+)
