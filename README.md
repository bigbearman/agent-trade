# whales-market-mcp — Whales Market MCP Server

[MCP](https://modelcontextprotocol.io) server for [Whales Market](https://whales.market) — the OTC trading platform for pre-market tokens, points, and allocations.

Query market data, token prices, offers, trades, wallet info, and execute trades directly from your AI assistant.

---

## Quick Install

### Claude Code (CLI)

```bash
# Global (available in all projects)
claude mcp add whales-market -s user -- npx -y whales-market-mcp

# Project only (current project)
claude mcp add whales-market -- npx -y whales-market-mcp
```

### Claude Desktop

Settings → Developer → Edit Config:

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "whales-market": {
      "command": "npx",
      "args": ["-y", "whales-market-mcp"]
    }
  }
}
```

### Cursor

Settings → MCP Servers → Add new MCP Server:

```json
{
  "mcpServers": {
    "whales-market": {
      "command": "npx",
      "args": ["-y", "whales-market-mcp"]
    }
  }
}
```

### VS Code (Copilot)

Add to `.vscode/settings.json` (workspace) or User Settings (global):

```json
{
  "mcp": {
    "servers": {
      "whales-market": {
        "command": "npx",
        "args": ["-y", "whales-market-mcp"]
      }
    }
  }
}
```

### Windsurf

Cascade → MCP → Configure (`mcp_config.json`):

```json
{
  "mcpServers": {
    "whales-market": {
      "command": "npx",
      "args": ["-y", "whales-market-mcp"]
    }
  }
}
```

### Cline

Settings → MCP Servers → Edit Config (`cline_mcp_settings.json`):

```json
{
  "mcpServers": {
    "whales-market": {
      "command": "npx",
      "args": ["-y", "whales-market-mcp"]
    }
  }
}
```

### Zed

Settings → Extensions or `settings.json`:

```json
{
  "context_servers": {
    "whales-market": {
      "command": {
        "path": "npx",
        "args": ["-y", "whales-market-mcp"]
      }
    }
  }
}
```

### Continue

`.continue/config.yaml`:

```yaml
mcpServers:
  - name: whales-market
    command: npx
    args: ["-y", "whales-market-mcp"]
```

### HTTP (Remote / Self-hosted)

```bash
# Docker
docker run -p 3000:3000 ghcr.io/bigbearman/whales-market-mcp

# Or manually
MCP_HTTP_PORT=3000 npx -y whales-market-mcp
```

Endpoints:
- `POST /mcp` — JSON-RPC requests
- `GET /mcp` — SSE stream
- `DELETE /mcp` — Session termination
- `GET /health` — Health check

---

## Available Tools

### Market Data (10 tools)

| Tool | Description |
|------|-------------|
| `search_tokens` | Search/list tokens with filters (category, chain, sort) |
| `get_token_detail` | Detailed info for a token by symbol |
| `get_token_chart` | Historical price chart data |
| `get_offers` | Buy/sell offers with filters |
| `get_recent_trades` | Recent trades across all markets |
| `get_market_stats` | Overall market statistics |
| `get_wallet_info` | Wallet info, tier, and discount |
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

---

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `WM_API_URL` | Whales Market API base URL | `https://api.whales.market` |
| `WM_AUTH_TOKEN` | Bearer token for authenticated endpoints | _(optional)_ |
| `MCP_HTTP_PORT` | Enable HTTP transport (e.g., `3000`) | _(stdio)_ |
| `MCP_HTTP_HOST` | Bind address for HTTP mode | `0.0.0.0` |

### Wallet Configuration (for trading tools)

| Variable | Description |
|----------|-------------|
| `WM_AGENT_PRIVATE_KEY` | Private key for agent mode (auto-sign transactions) |
| `WM_WALLET_ADDRESS` | Wallet address for user mode (preview only, no signing) |
| `WM_WALLET_TYPE` | `solana` or `evm` (default: `solana`) |
| `WM_DAILY_LIMIT` | Max daily spend in USD (default: 200) |
| `WM_SPEND_LIMIT_PER_TX` | Max single trade in USD (default: 50) |

**Modes:**
- **Agent mode** (`WM_AGENT_PRIVATE_KEY`): Fully autonomous — validates limits, signs, and submits transactions.
- **User mode** (`WM_WALLET_ADDRESS`): Read-only + preview — shows trade details but does not sign.

---

## Usage Examples

Once connected, ask your AI assistant:

- *"Search for pre-market tokens on Whales Market"*
- *"What's the current price of HYPE?"*
- *"Show me recent trades"*
- *"Get market statistics"*
- *"Show the order book for PENGU"*
- *"What tokens are coming soon?"*
- *"Check my portfolio"*
- *"Create a buy offer for 10 HYPE at $25"*

---

## Development

```bash
git clone https://github.com/bigbearman/whales-market-mcp.git
cd whales-market-mcp
npm install
npm run dev       # Dev mode with hot reload
npm run build     # Compile TypeScript
npm run inspect   # MCP Inspector for debugging
```

## License

MIT — [Whales Market](https://whales.market)
