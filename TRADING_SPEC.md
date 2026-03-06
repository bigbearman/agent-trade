# Trading Integration Spec — Solana Pre-Market

## Goal
Port Solana smart contract trading from frontend SDK into wm-mcp server. Agent must be able to create offers, fill offers, close offers, and cancel orders — all on-chain.

## Architecture
Trading on Whales Market is NOT via REST API. It's on-chain Solana smart contract interaction via Anchor SDK.

### Flow
1. Build Solana transaction using Anchor program
2. Sign with agent's Keypair (from WM_AGENT_PRIVATE_KEY env)
3. Submit on-chain
4. Backend auto-detects via event listener (no API call needed)

## Contract Addresses

### Devnet (for testing)
- Program ID: `F8iCXCQDmUSNVB8zD7WmkDumKTqxWaMfMSXtNmRUtw4q`
- Config Account: `G36EWnoEPDWy62Lz9cYdi7R7LvQngsbgrZSmZKkLtAa9`
- RPC: `https://api.devnet.solana.com`

### Mainnet
- Program ID: `stPdYNaJNsV3ytS9Xtx4GXXXRcVqVS6x66ZFa26K39S`
- Config Account: `5BA233jRRKAZsY765p72CXGZn5F5DMxtnP2ShhbJ2UBp`
- RPC: `https://api.mainnet-beta.solana.com`

## Reference Files
All in `reference/solana-sdk/`:
- `PreMarket.ts` — Core SDK: createOffer, fillOffer, closeUnFullFilledOffer, cancelUnfilledOrder, settleOrder
- `pre_market.ts` — Anchor IDL (3476 lines)
- `accounts.ts` — PDA derivation (getOfferAccountPubKey, getOrderAccountPubKey, etc.)
- `constants.ts` — WEI6 = 1_000_000
- `utils.ts` — wrapSOL/unwrapSOL helpers
- `SolanaPreMarketContract.ts` — Frontend wrapper (shows full flow: build tx → add blockhash → sign → send)

## What to Build

### New file: `src/solana-trading.ts`
Port the PreMarket SDK to work server-side with Keypair signing (no browser wallet).

Key functions:
1. `createOffer(tokenId, type, exToken, amount, price, isFullMatch, wallet)` — Create buy/sell offer
2. `fillOffer(offerId, amount, wallet)` — Fill an existing offer
3. `closeOffer(offerId, wallet)` — Close unfilled offer (cancel your own offer)
4. `cancelOrder(orderId, wallet)` — Cancel unfilled order
5. `getOnChainOffer(offerId)` — Read offer data from chain
6. `getOnChainOrder(orderId)` — Read order data from chain

### Signing approach
- Use `@solana/web3.js` Keypair from private key (already in wallet.ts)
- Sign VersionedTransaction with `transaction.sign([keypair])`
- Send via `connection.sendRawTransaction(transaction.serialize())`
- No browser wallet adapter needed

### Update `src/index.ts` tools
Update existing Phase 2 trading tools to use `solana-trading.ts` instead of REST API calls:
- `create_buy_intent` → calls `createOffer` with type='buy'
- `create_sell_intent` → calls `createOffer` with type='sell'
- `react_to_offer` → calls `fillOffer`
- `cancel_offer` → calls `closeOffer`

### Env vars
```
WM_AGENT_PRIVATE_KEY — Solana private key (bs58)
WM_WALLET_TYPE=solana
WM_SOLANA_RPC — RPC URL (default: devnet for dev, mainnet for prod)
WM_PROGRAM_ID — Override program ID (optional)
WM_CONFIG_ACCOUNT — Override config account (optional)
```

Auto-detect dev vs prod:
- If WM_API_URL contains "dev" → use devnet addresses
- Otherwise → use mainnet addresses

### Dependencies to add
```json
"@coral-xyz/anchor": "^0.29.0",
"@solana/spl-token": "^0.3.0"
```
(@solana/web3.js and bs58 already in package.json)

## Safety Requirements
1. Check spend limits BEFORE building transaction (already in wallet.ts)
2. Check balance BEFORE submitting
3. Simulate transaction before sending (like frontend does)
4. Add compute budget instructions (like frontend: 200K microLamports price, auto CU limit)
5. dry_run parameter: if true, simulate only, don't send
6. Return tx hash on success

## Testing
- Test wallet: `EK9ZCrxzuHJpooMra4phAq65iER2E1g9xZGBnzjSzRmo` (5 SOL devnet)
- Use devnet RPC
- Test create a buy offer for any active token on dev API

## Constraints
- All code in English (comments, variable names)
- TypeScript strict mode
- Must compile with existing tsconfig.json
- Co-author: `whalesmarketdev <dev@whales.market>`
