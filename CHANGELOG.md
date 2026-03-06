# Changelog

## [1.0.3] - 2026-03-06

### Added
- **On-chain Solana trading** — `createOffer`, `fillOffer`, `closeOffer`, `cancelOrder` via Anchor SDK
- New files: `src/solana-trading.ts`, `src/accounts.ts`, `src/constants.ts`, `src/idl/pre_market.ts`
- Server-side Keypair signing (no browser wallet needed)
- Transaction simulation before execution (compute budget auto-detect)
- `dry_run` mode for all trading tools — simulates without sending
- Auto-detect devnet/mainnet from `WM_API_URL` env var
- Dependencies: `@coral-xyz/anchor`, `@solana/spl-token`

### Security
- **SpendTracker persisted to disk** (`~/.whales-market-mcp/spend-tracker.json`) — no longer resets on restart
- **Atomic spend check** — prevents race condition on parallel tool calls
- **Private key never returned in MCP response** — `setup_wallet generate` saves key to file with `chmod 600`
- **Price check fail-closed** — blocks trade when API is unreachable (was: allow)

### Fixed
- Corrected Solana contract addresses (frontend mixed Pre-market with OTC contracts)
  - Devnet config: `7e3Frd6t4adXx3RXPyqh28ZuBBSdzkSmuFJCphsfF773`
  - Mainnet config: `GDsMbTq82sYcxPRLdQ9RHL9ZLY3HNVpXjXtCnyxpb2rQ`
  - Mainnet fee wallet: `8FzAESKaw5yFZjDNNX7SU98gTEKZF6n57W94ehw38KRN`
- `get_my_offers` and `get_my_portfolio` now require `symbol` param (backend API requirement)
- `api-client.ts` passes `symbol` to `/v2/offers-by-address/` endpoint

### Verified on Devnet
- `create_buy_intent` — on-chain tx confirmed ✅
- `create_sell_intent` — on-chain tx confirmed ✅
- `cancel_offer` — offer closed on-chain ✅
- `react_to_offer` — order filled on-chain ✅
- All 23 tools working ✅

## [1.0.2] - 2026-03-06

### Fixed
- Include CHANGELOG.md in npm package

## [1.0.1] - 2026-03-06

### Added
- `setup_wallet` tool — interactive wallet setup with keygen support
- Phase 2: Wallet & Trading — 12 new tools (`get_wallet_status`, `get_order_book`, `get_my_offers`, `get_my_orders`, `get_my_portfolio`, `get_balance`, `get_networks`, `create_buy_intent`, `create_sell_intent`, `react_to_offer`, `cancel_offer`, `check_intent_status`)
- Wallet manager (`src/wallet.ts`) — Solana/EVM support with spend limits
- Trade execution engine (`src/trading.ts`) — order book, price sanity checks
- ROADMAP.md and PHASE2_SPEC.md documentation

### Fixed
- `get_offers` now requires `symbol` param, aligned params with backend DTO

### Changed
- Renamed project to `whales-market-mcp`
- Updated README with full installation and usage docs
- Translated all docs from Vietnamese to English

## [1.0.0] - 2026-02-28

### Added
- Initial release — MVP with 10 market data tools
- MCP server with stdio transport
- `search_tokens`, `get_token_detail`, `get_token_chart`, `get_offers`, `get_recent_trades`, `get_market_stats`, `get_wallet_info`, `get_orders_by_address`, `get_upcoming_tokens`, `get_leaderboard`
- npm package publishing support
- Docker support
