# Polymarket Adapter Spec

## Overview
Add Polymarket adapter to agent-trade MCP server. Polymarket is a prediction market on Polygon (chain 137) using USDC.

## Architecture
```
src/adapters/polymarket/
├── index.ts          # PolymarketAdapter implements TradingAdapter
├── gamma-client.ts   # Gamma API client (read-only market data, NO auth needed)
├── clob-client.ts    # CLOB trading client (uses @polymarket/clob-client)
└── types.ts          # Polymarket-specific types
```

## Dependencies to add
```
@polymarket/clob-client  (npm)
ethers@5                 (required by clob-client, NOT ethers v6)
```

NOTE: The existing project uses ethers v6 for EVM trading. Polymarket SDK requires ethers v5.
Solution: Install ethers v5 as `ethers5` alias OR use the clob-client's bundled ethers.
Actually, @polymarket/clob-client bundles its own ethers v5 internally, so we just need to use
ethers v5 Wallet for signer creation in our adapter. Import { Wallet } from "ethers" may conflict.
Best approach: use `require("@polymarket/clob-client")` types and let it handle ethers internally.
OR: install `@ethersproject/wallet` (v5 standalone package) for signer only.

## APIs

### Gamma API (read-only, no auth)
Base URL: `https://gamma-api.polymarket.com`

| Endpoint | Description |
|----------|-------------|
| `GET /events?active=true&closed=false&limit=100` | List active events with markets |
| `GET /events/slug/{slug}` | Get event by slug |
| `GET /markets?active=true&closed=false` | List active markets |
| `GET /markets?slug={slug}` | Get market by slug |
| `GET /markets?tag_id={id}` | Filter by tag |
| `GET /tags` | List available tags |
| `GET /sports` | Sports metadata |

Market response includes: `id`, `question`, `slug`, `clobTokenIds` (YES/NO token IDs), `outcomePrices`, `volume`, `liquidity`, `startDate`, `endDate`, `active`, `closed`

### CLOB API (trading, needs auth)
Base URL: `https://clob.polymarket.com`
Chain ID: 137 (Polygon mainnet)

Uses `@polymarket/clob-client` SDK:
```typescript
import { ClobClient, Side } from "@polymarket/clob-client";

// Init
const client = new ClobClient(host, chainId, signer, creds, signatureType, funderAddress);

// Get API creds (derive from private key)
const creds = await tempClient.createOrDeriveApiKey();

// Get order book
const book = await client.getOrderBook(tokenID);

// Place order
const order = await client.createAndPostOrder(
  { tokenID, price: 0.50, size: 10, side: Side.BUY },
  { tickSize: "0.01", negRisk: false }
);

// Cancel order
await client.cancelOrder({ orderID: "..." });

// Get open orders
const orders = await client.getOpenOrders();

// Get trades
const trades = await client.getTrades();
```

## Adapter Implementation

### PolymarketAdapter implements TradingAdapter

```typescript
class PolymarketAdapter implements TradingAdapter {
  name = 'polymarket';
  displayName = 'Polymarket';
  
  private gammaClient: GammaClient;   // read-only
  private clobClient?: ClobClient;    // trading (optional, needs PM_PRIVATE_KEY)
  
  isConfigured(): boolean {
    // Always true for read-only (Gamma API is public)
    // Trading requires PM_PRIVATE_KEY
    return true;
  }
  
  // searchMarkets → Gamma API /markets or /events
  // getMarketDetail → Gamma API /markets?slug=...
  // getOrderBook → CLOB client.getOrderBook(tokenID) 
  // getRecentTrades → CLOB client.getTrades()
  // trade → CLOB client.createAndPostOrder()
  // cancel → CLOB client.cancelOrder()
  // getPositions → not directly available, use custom tool
  // getOpenOrders → CLOB client.getOpenOrders()
}
```

### Custom Tools (adapter-specific)
| Tool | Description |
|------|-------------|
| `pm_list_tags` | List available Polymarket tags/categories |
| `pm_get_event` | Get full event with all markets by slug |
| `pm_derive_api_key` | Derive API credentials from private key (one-time setup) |

## Env Vars
```
# Polymarket (all optional for read-only)
PM_PRIVATE_KEY=          # Polygon wallet private key (for trading)
PM_API_KEY=              # Derived API key
PM_API_SECRET=           # Derived API secret  
PM_API_PASSPHRASE=       # Derived API passphrase
PM_SIGNATURE_TYPE=0      # 0=EOA, 1=Magic, 2=Proxy
PM_FUNDER_ADDRESS=       # Funder address (usually same as wallet)
```

## Key Design Points

1. **Read-only works without any config** — Gamma API is fully public
2. **Trading needs private key** — CLOB API requires derived API credentials
3. **Polygon chain** — needs MATIC for gas (tiny amounts), USDC for trading
4. **Approval flow** — USDC must be approved for Polymarket CTF Exchange contract before first trade
5. **Neg risk markets** — some markets use negative risk model (multi-outcome), set `negRisk: true`
6. **Tick sizes** — vary by market, usually "0.01" or "0.001"
7. **Token IDs** — each market has YES and NO token IDs in `clobTokenIds` array

## Mapping to TradingAdapter Interface

| TradingAdapter method | Polymarket implementation |
|----------------------|--------------------------|
| `searchMarkets(params)` | `GET /events?active=true&closed=false` → map to Market[] |
| `getMarketDetail(id)` | `GET /markets?slug={id}` or `/markets/{conditionId}` |
| `getOrderBook(marketId)` | `clobClient.getOrderBook(tokenId)` |
| `getRecentTrades(marketId)` | `clobClient.getTrades({ asset_id: tokenId })` |
| `trade(intent)` | `clobClient.createAndPostOrder()` |
| `cancel(orderId)` | `clobClient.cancelOrder()` |
| `getPositions(address)` | Gamma API position endpoints or CLOB |
| `getOpenOrders(address)` | `clobClient.getOpenOrders()` |

## Build & Test
1. `npm install @polymarket/clob-client`
2. Implement adapter
3. Register in registry (auto-detect via env vars or always-on for read-only)
4. Build: `npm run build`
5. Test read-only: search markets, get order book (no API key needed)
