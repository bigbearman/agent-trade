# whales-market-mcp — Whales Market MCP Server

## Overview
MCP (Model Context Protocol) server for Whales Market — the OTC trading platform for pre-market tokens, points, and allocations.

## Tech Stack
- **Runtime**: Node.js 20+, TypeScript 5
- **MCP SDK**: `@modelcontextprotocol/sdk` v1.12+
- **HTTP**: axios
- **Validation**: zod
- **Transport**: stdio (default) or HTTP (StreamableHTTP)

## Project Structure
```
src/
├── index.ts        # MCP server + 22 tool definitions
├── api-client.ts   # WhalesMarketAPI class (axios wrapper)
├── wallet.ts       # WalletManager (Solana/EVM, spend limits)
├── trading.ts      # Trade execution, order book, price sanity
└── types.ts        # TypeScript types & enums
```

## Commands
```bash
npm run build       # Compile TypeScript → dist/
npm run dev         # Dev mode with hot reload (tsx watch)
npm start           # Run compiled server
npm run inspect     # Open MCP Inspector for debugging
```

## Environment Variables
- `WM_API_URL` — Whales Market API base URL (default: `https://api.whales.market`)
- `WM_AUTH_TOKEN` — Optional Bearer token for authenticated endpoints
- `MCP_HTTP_PORT` — Set to enable HTTP transport mode (e.g., `3000`). If not set, uses stdio.
- `MCP_HTTP_HOST` — Bind address for HTTP mode (default: `0.0.0.0`)
- `WM_AGENT_PRIVATE_KEY` — Private key for agent mode (auto-sign transactions)
- `WM_WALLET_ADDRESS` — Wallet address for user mode (preview only)
- `WM_WALLET_TYPE` — `solana` or `evm` (default: `solana`)
- `WM_DAILY_LIMIT` — Max daily spend in USD (default: 200)
- `WM_SPEND_LIMIT_PER_TX` — Max single trade in USD (default: 50)

## MCP Tools (22 tools)

### Market Data (10 tools)
| Tool | Description |
|------|-------------|
| `search_tokens` | Search/list tokens with filters (category, chain, sort) |
| `get_token_detail` | Get detail of a token by symbol |
| `get_token_chart` | Historical price chart data |
| `get_offers` | Buy/sell offers with filters |
| `get_recent_trades` | Recent trades across all markets |
| `get_market_stats` | Overall market statistics |
| `get_wallet_info` | Wallet info, tier, discount for an address |
| `get_orders_by_address` | All orders for a wallet address |
| `get_upcoming_tokens` | Upcoming tokens list |
| `get_leaderboard` | Referral leaderboard + live stats |

### Wallet & Trading (12 tools)
| Tool | Description |
|------|-------------|
| `get_wallet_status` | Current wallet config, mode, spend limits |
| `get_order_book` | Order book for a token (bids, asks, spread) |
| `get_my_offers` | Your open/filled offers |
| `get_my_orders` | Your orders |
| `get_my_portfolio` | Portfolio summary (offers, orders, positions) |
| `get_balance` | On-chain wallet balance (SOL/ETH) |
| `get_networks` | Supported blockchain networks |
| `create_buy_intent` | Create a buy offer |
| `create_sell_intent` | Create a sell offer |
| `react_to_offer` | Accept/fill an existing offer |
| `cancel_offer` | Cancel your own offer |
| `check_intent_status` | Check status of an offer |

## Whales Market API
- **Dev**: `https://api-dev.whales-market.site`
- **Prod**: `https://api.whales.market`
- **Auth**: Bearer token via `Authorization` header
- **Timeout**: 30s

## Integration
Add to Claude Code settings (`~/.claude/settings.json`):
```json
{
  "mcpServers": {
    "whales-market-mcp": {
      "command": "node",
      "args": ["/Users/kienduong/works/xlab3/ai-space/wm-mcp/dist/index.js"]
    }
  }
}
```
> Default calls prod API (`https://api.whales.market`). Override with `WM_API_URL` env if needed.

### HTTP Transport (Remote)
Run as an HTTP server for remote MCP clients:
```bash
MCP_HTTP_PORT=3000 npm start
```
Then configure clients to connect via `http://<host>:3000/mcp`.

## Key Conventions
- All tools return JSON formatted results
- Errors return `{ isError: true }` with error message
- Pagination: `page` (1-based) + `take` (items per page, default 20)
- Console output goes to stderr (stdout reserved for MCP protocol)
