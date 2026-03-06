# Phase 2 — Wallet + Trading

## Context
This is an MCP server (`whales-market-mcp`) for Whales Market OTC trading platform.
Built with TypeScript, `@modelcontextprotocol/sdk`, Express, Zod.

Phase 1 (10 read-only tools) is done in `src/index.ts` and `src/api-client.ts`.

Reference implementation: `../whale-market-cli/` — has wallet auth, signing, and API patterns.

## Architecture: Dual Mode

### Agent Mode (has WM_AGENT_PRIVATE_KEY env)
- MCP reads private key from env → derives wallet address
- Can sign transactions directly → auto-execute trades
- Enforces spend limits from env config

### User Mode (no private key)
- Read-only personal data using wallet address from `WM_WALLET_ADDRESS` env
- Trading tools return unsigned tx preview + approval link
- No signing capability

### Detection Logic
```typescript
const privateKey = process.env.WM_AGENT_PRIVATE_KEY;
const walletType = process.env.WM_WALLET_TYPE || 'solana'; // 'solana' | 'evm'
const isAgentMode = !!privateKey;

// If agent mode: derive address from private key
// If user mode: use WM_WALLET_ADDRESS env (read-only)
```

## Env Variables
```
WM_API_URL=https://api.whales.market          # API base (existing)
WM_AGENT_PRIVATE_KEY=xxx                       # Private key for agent mode (optional)
WM_WALLET_TYPE=solana                          # solana | evm (default: solana)
WM_WALLET_ADDRESS=xxx                          # Read-only address for user mode (optional)
WM_SPEND_LIMIT_PER_TX=50                       # Max USD per transaction (agent mode)
WM_DAILY_LIMIT=200                             # Max USD per day (agent mode)
```

## New Tools to Add

### 1. `get_wallet_status`
Returns current wallet config: address, type, mode (agent/user), balance, daily spend remaining.
No params needed — reads from env.

### 2. `get_order_book`
Order book for a token: buy/sell offers sorted by price, spread, depth.
Params: `symbol` (required), `depth` (optional, default 10)
Use API: `GET /v2/offers?symbol=<SYMBOL>&status=open`
Reference: `../whale-market-cli/src/commands/book.ts`

### 3. `get_my_offers`
My open/filled offers.
Requires wallet address (from env).
Use API: `GET /transactions/offers-by-address/<address>`

### 4. `get_my_orders`
My orders.
Requires wallet address.
Use API: `GET /transactions/orders-by-address/<address>`

### 5. `get_my_portfolio`
Portfolio summary: positions, total value, PnL.
Requires wallet address.
Reference: `../whale-market-cli/src/commands/portfolio.ts`

### 6. `get_balance`
On-chain balance of wallet.
Params: `address` (optional, defaults to configured wallet)
For Solana: use `@solana/web3.js` Connection.getBalance
For EVM: use ethers provider.getBalance

### 7. `get_networks`
List supported blockchain networks.
Use API: `GET /network-chains`

### 8. `create_buy_intent`
Create a buy offer.
Params: `symbol`, `amount`, `price`
- Agent mode: validate → check limits → sign → POST /transactions/create-offer → return result
- User mode: validate → return preview + unsigned tx data
Reference: `../whale-market-cli/src/auth.ts` for signing logic

### 9. `create_sell_intent`
Create a sell offer. Same flow as buy.
Params: `symbol`, `amount`, `price`

### 10. `react_to_offer`
Accept/fill an existing offer.
Params: `offer_id`, `amount` (optional, for partial fill)
- Agent mode: sign → POST /transactions/reaction-offer/<offer_id>
- User mode: return preview + link

### 11. `cancel_offer`
Cancel own offer.
Params: `offer_id`
- Agent mode: sign → POST /transactions/cancel-offer/<offer_id>
- User mode: return preview + link

### 12. `check_intent_status`
Check status of a previously created intent/offer.
Params: `offer_id`

## Safety (Agent Mode Only)

1. **Spend limit per tx**: Block if trade value > WM_SPEND_LIMIT_PER_TX
2. **Daily limit**: Track daily spend in memory, block if exceeded
3. **Price sanity**: Block if price deviates >10% from last_price
4. **Balance check**: Verify sufficient balance before signing
5. **Dry run**: All trading tools accept `dry_run: boolean` param — returns preview without executing

## Code Structure

```
src/
  index.ts          # MCP server + tool registration (modify)
  api-client.ts     # API client (modify — add new endpoints)
  types.ts          # Types (modify)
  wallet.ts         # NEW — wallet management (derive address, sign, balance)
  trading.ts        # NEW — trading logic (create offer, react, cancel, limits)
```

## Dependencies to Add
- `@solana/web3.js` — Solana wallet operations
- `ethers` — EVM wallet operations  
- `tweetnacl` — Solana signing
- `bs58` — Base58 encoding

## Important Notes
- Keep all existing Phase 1 tools working (don't break them)
- Follow existing code patterns in index.ts for registering tools
- Use Zod schemas for input validation (existing pattern)
- Reference `../whale-market-cli/src/auth.ts` for wallet/signing implementation
- Reference `../whale-market-cli/src/api.ts` for API endpoint patterns
- All trading tool descriptions should clearly state whether they require wallet config
- Test with: `npm run build` (must compile without errors)
