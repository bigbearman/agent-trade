# Changelog

## 0.1.0 (2026-03-06)

### Features
- Adapter pattern architecture for multi-venue trading
- **Polymarket adapter** — prediction market (Polygon)
  - Read-only via Gamma API (no auth needed)
  - Trading via CLOB API (@polymarket/clob-client)
  - Custom tools: pm_list_tags, pm_get_event, pm_derive_api_key
- **Whales Market adapter** — pre-market OTC (Solana + 20+ EVM chains)
  - On-chain Solana trading via Anchor SDK
  - EVM trading via ethers.js
  - Custom tools: wm_get_token_chart, wm_get_market_stats, wm_get_wallet_info, wm_get_upcoming_tokens
- 11 universal MCP tools + 7 venue-specific tools
- Dual mode: Agent (auto-sign) + User (preview)
- Spend tracking with persistent disk storage
- Safety: per-tx limits, daily limits, price sanity checks
- HTTP transport support (optional)
