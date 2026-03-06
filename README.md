# agent-trade

**MCP server for AI agent trading — any agent, any venue.**

Give your AI agent the ability to trade across prediction markets, pre-markets, and DEXs through a single [Model Context Protocol](https://modelcontextprotocol.io) server.

## Features

- 🔌 **Multi-venue** — One MCP server, multiple trading venues
- 🤖 **Agent Mode** — Auto-sign trades with a dedicated wallet
- 👤 **User Mode** — Preview trades, sign manually
- 🛡️ **Safety built-in** — Spend limits, price sanity checks, persistent tracking
- 🔗 **Multi-chain** — Solana, Polygon, 20+ EVM chains
- 📖 **Read-only works instantly** — No API keys needed for market data

## Supported Venues

| Venue | Type | Read | Trade | Chain |
|-------|------|------|-------|-------|
| [Polymarket](https://polymarket.com) | Prediction Market | ✅ | ✅ | Polygon |
| [Whales Market](https://whales.market) | Pre-market OTC | ✅ | ✅ | Solana, 20+ EVM |

## Quick Start

### With Claude Desktop / Cursor

Add to your MCP config:

```json
{
  "mcpServers": {
    "agent-trade": {
      "command": "npx",
      "args": ["-y", "agent-trade"],
      "env": {}
    }
  }
}
```

That's it — market data works immediately with zero config.

### With Claude Code

```bash
claude mcp add agent-trade -- npx -y agent-trade
```

### With OpenClaw

```bash
mcporter add agent-trade --command "npx -y agent-trade"
```

## Tools

### Universal Tools (all venues)

| Tool | Description |
|------|-------------|
| `list_venues` | List available trading venues and their status |
| `search_markets` | Search markets across venues |
| `get_market` | Get detailed market info |
| `get_order_book` | Get order book (bids/asks) |
| `get_recent_trades` | Get recent trades |
| `trade` | Place a buy/sell order |
| `cancel` | Cancel an open order |
| `get_positions` | Get portfolio positions |
| `get_orders` | Get open orders |
| `wallet_status` | Check wallet balance and spend limits |
| `setup_wallet` | Generate or configure wallet |

### Polymarket Tools

| Tool | Description |
|------|-------------|
| `pm_list_tags` | List market categories/tags |
| `pm_get_event` | Get event with all markets by slug |
| `pm_derive_api_key` | Derive API credentials (one-time) |

### Whales Market Tools

| Tool | Description |
|------|-------------|
| `wm_get_token_chart` | Token price chart data |
| `wm_get_market_stats` | Market statistics & overview |
| `wm_get_wallet_info` | Wallet info by address |
| `wm_get_upcoming_tokens` | Upcoming token listings |

## Configuration

### Environment Variables

#### Global

| Variable | Description | Default |
|----------|-------------|---------|
| `AGENT_TRADE_VENUES` | Enabled venues (comma-separated) | All available |
| `AT_WALLET_TYPE` | Wallet type: `solana` or `evm` | `solana` |
| `AT_AGENT_PRIVATE_KEY` | Agent wallet private key | — |
| `AT_SPEND_LIMIT_PER_TX` | Max spend per transaction (USD) | `50` |
| `AT_DAILY_LIMIT` | Max daily spend (USD) | `200` |
| `AT_SOLANA_RPC` | Custom Solana RPC URL | Public RPC |
| `AT_EVM_RPC` | Custom EVM RPC URL | Public RPC |
| `MCP_HTTP_PORT` | Enable HTTP transport on this port | — (stdio) |
| `MCP_HTTP_HOST` | HTTP bind address | `127.0.0.1` |

#### Polymarket

| Variable | Description | Required |
|----------|-------------|----------|
| `PM_PRIVATE_KEY` | Polygon wallet private key | For trading |
| `PM_API_KEY` | Derived API key | For trading |
| `PM_API_SECRET` | Derived API secret | For trading |
| `PM_API_PASSPHRASE` | Derived API passphrase | For trading |

> **Read-only mode needs zero config.** Set `PM_PRIVATE_KEY` to enable trading. Use `pm_derive_api_key` tool to generate API credentials.

#### Whales Market

| Variable | Description | Required |
|----------|-------------|----------|
| `WM_API_URL` | API base URL | No (defaults to mainnet) |
| `WM_AUTH_TOKEN` | Auth token for private endpoints | For portfolio |

## Trading Modes

### User Mode (default)

Agent previews the trade, you sign and execute manually:

```
You: "Buy 10 YES shares on 'Bitcoin above 100k by July?'"
Agent: "Preview: Buy 10 YES @ $0.62 = $6.20 total. Confirm?"
```

### Agent Mode

Agent signs and executes trades autonomously with a dedicated wallet:

```
You: "Find underpriced markets and buy"
Agent: [executes trade on-chain] "Bought 10 YES @ $0.62, tx: 0x..."
```

**Safety features:**
- Per-transaction spend limit (default $50)
- Daily spend limit (default $200)
- Price sanity checks against market data
- Persistent spend tracking across restarts
- Private key never exposed in responses

## Architecture

```
┌─────────────────────────────┐
│     AI Agent (Claude, etc)  │
│         MCP Client          │
└──────────┬──────────────────┘
           │ MCP Protocol
┌──────────▼──────────────────┐
│       agent-trade           │
│    Universal MCP Tools      │
│  ┌─────────┐ ┌───────────┐  │
│  │ Wallet  │ │  Safety   │  │
│  │ Manager │ │ (Spend    │  │
│  │         │ │  Tracker) │  │
│  └────┬────┘ └─────┬─────┘  │
│       │    Adapter  │        │
│       │   Registry  │        │
│  ┌────▼────┐ ┌─────▼─────┐  │
│  │Polymar- │ │  Whales   │  │
│  │  ket    │ │  Market   │  │
│  │ Gamma + │ │ API +     │  │
│  │  CLOB   │ │ Solana +  │  │
│  │         │ │ EVM       │  │
│  └─────────┘ └───────────┘  │
└──────────────────────────────┘
```

## Adding New Venues

agent-trade uses an adapter pattern. To add a new venue:

1. Create `src/adapters/your-venue/index.ts` implementing `TradingAdapter`
2. Register in `src/registry.ts`
3. That's it — universal tools work automatically

```typescript
import { TradingAdapter, Market, TradeIntent, TradeResult } from '../adapter.js';

export class YourVenueAdapter implements TradingAdapter {
  name = 'your-venue';
  displayName = 'Your Venue';

  isConfigured(): boolean { return true; }
  async searchMarkets(params): Promise<Market[]> { /* ... */ }
  async trade(intent: TradeIntent): Promise<TradeResult> { /* ... */ }
  // ... implement remaining methods
}
```

## Development

```bash
git clone https://github.com/bigbearman/agent-trade.git
cd agent-trade
npm install
npm run build
npm run dev  # watch mode
```

### Test with MCP Inspector

```bash
npm run inspect
```

## License

MIT
