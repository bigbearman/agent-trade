# Roadmap — whales-market-mcp

## v1.0 — Market Data (current)

Read-only tools for querying Whales Market data. No auth or wallet required.

### Tools (12)

| # | Tool | Description |
|---|------|-------------|
| 1 | `search_tokens` | Search tokens (category, chain, sort) |
| 2 | `get_token_detail` | Token details by symbol |
| 3 | `get_token_chart` | Historical chart data |
| 4 | `get_offers` | List buy/sell offers |
| 5 | `get_recent_trades` | Most recent trades |
| 6 | `get_market_stats` | Market overview statistics |
| 7 | `get_wallet_info` | Wallet info by address |
| 8 | `get_orders_by_address` | Orders for a wallet |
| 9 | `get_upcoming_tokens` | Upcoming token listings |
| 10 | `get_leaderboard` | Referral leaderboard |
| 11 | `get_order_book` | Order book (bids/asks/spread) |
| 12 | `get_networks` | Supported blockchain networks |

### Steps

- [x] Core MCP server (stdio transport)
- [x] 12 read-only tools
- [x] HTTP transport (StreamableHTTP)
- [x] Docker support
- [x] npm publish (`whales-market-mcp`)
- [x] README with multi-platform install (Claude Code, Desktop, Cursor, VS Code, Windsurf, Cline, Zed, Continue)
- [ ] Test all tools against prod API
- [ ] CI/CD: auto build + publish on tag

---

## v2.0 — Wallet & Portfolio

Connect wallet to view personal portfolio. Read-only, no trading.

### New Tools (~6)

| Tool | Description |
|------|-------------|
| `setup_wallet` | Interactive wallet setup + keygen |
| `get_wallet_status` | Current wallet config, mode, limits |
| `get_my_offers` | Your open/filled offers |
| `get_my_orders` | Your orders |
| `get_my_portfolio` | Portfolio summary |
| `get_balance` | On-chain balance (SOL/ETH) |

### Steps

- [ ] Wallet config via env vars (`WM_WALLET_ADDRESS`, `WM_WALLET_TYPE`)
- [ ] User mode only (read-only, no signing)
- [ ] Solana + EVM balance check
- [ ] Test with real wallet on mainnet

---

## v3.0 — Trading (Agent Mode)

Create/cancel offers, react to offers. Requires private key with spend limits.

### New Tools (~5)

| Tool | Description |
|------|-------------|
| `create_buy_intent` | Create a buy offer |
| `create_sell_intent` | Create a sell offer |
| `react_to_offer` | Accept an existing offer |
| `cancel_offer` | Cancel your own offer |
| `check_intent_status` | Check offer status |

### Steps

- [ ] Verify Whales Market API endpoints (`/transactions/*`)
- [ ] Confirm signature format (EIP-712? Solana sign message?)
- [ ] Agent mode: private key + auto-sign
- [ ] Spend limits (per-tx + daily)
- [ ] Price sanity check (block if price deviates > 10%)
- [ ] Dry run mode (preview before execution)
- [ ] Test on devnet/testnet first

---

## v4.0 — OAuth Authentication

Browser-based login, no need to paste private key. More secure.

### Steps

- [ ] Implement `OAuthServerProvider`
- [ ] OAuth routes (`/authorize`, `/token`, `/register`)
- [ ] Integrate Whales Market OAuth (if API supports it)
- [ ] `requireBearerAuth` middleware
- [ ] Auto token refresh
- [ ] HTTP transport only (stdio does not support OAuth)

---

## v5.0 — Advanced Features

| Feature | Description |
|---------|-------------|
| Alerts & Notifications | Price threshold alerts |
| Auto-trading strategies | DCA, limit order queue |
| Multi-wallet | Manage multiple wallets |
| Analytics | PnL tracking, trade history analysis |
| WebSocket | Real-time price feed |
