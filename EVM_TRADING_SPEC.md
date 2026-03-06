# EVM Trading Spec — whales-market-mcp

## Goal
Port EVM pre-market trading from the Whales Market frontend SDK into the MCP server.
Enable AI agents to create/fill/close/cancel offers on EVM chains without browser wallet.

## Reference Files
All in `reference/evm-sdk/`:
- `EvmPreMarketContract.ts` — main SDK (707 lines): create, fill, close, settle, cancel
- `PreMarketAbi.ts` — base ABI (no referral)
- `PreMarketAbiRef.ts` — ABI with referral support
- `cli-constants.ts` — all chain configs, contract addresses, fund distributors, RPC URLs
- `EvmTokenContract.ts` — ERC20 helpers (approve, balance, decimals)
- `helpers.ts` — getValues() price calculation
- `frontend-constants.ts` — ETH_ADDRESS constant

## Architecture

### New Files to Create
1. `src/evm-trading.ts` — main EVM trading class (EvmTrading)
2. `src/evm-constants.ts` — chain configs, contract addresses, ABIs (copy from cli-constants.ts)
3. `src/abi/PreMarketAbi.ts` — base ABI
4. `src/abi/PreMarketAbiRef.ts` — referral ABI

### Files to Update
1. `src/trading.ts` — route to EVM or Solana based on chain_id from token detail
2. `src/wallet.ts` — already supports EVM via ethers.js (Wallet class)
3. `src/index.ts` — update trading tools to support EVM tokens

## Key Design Decisions

### 1. Chain Detection
- Get token detail from API → `chain_id` field tells us which chain
- If chain_id is 666666 (SOLANA_MAINNET) or 999999 (SOLANA_DEVNET) → use Solana trading
- Otherwise → EVM trading with the chain_id
- Look up contract address + RPC from the constants

### 2. Signing (Server-Side)
```typescript
import { ethers } from 'ethers';
// Use existing WM_AGENT_PRIVATE_KEY (hex format for EVM)
// Or new WM_EVM_PRIVATE_KEY if user wants separate EVM key
const provider = new ethers.JsonRpcProvider(rpcUrl);
const wallet = new ethers.Wallet(privateKey, provider);
```

### 3. Contract Interaction
```typescript
const contract = new ethers.Contract(contractAddress, abi, wallet);
// For referral-enabled chains, use PreMarketAbiRef
// For others, use PreMarketAbi
```

### 4. ERC20 Token Approval
Before creating offers or filling, check allowance and approve if needed:
```typescript
const tokenContract = new ethers.Contract(exTokenAddress, ERC20_ABI, wallet);
const allowance = await tokenContract.allowance(wallet.address, contractAddress);
if (allowance < amount) {
  const tx = await tokenContract.approve(contractAddress, ethers.MaxUint256);
  await tx.wait();
}
```

### 5. Native ETH vs ERC20
- If exTokenAddress === '0x0000000000000000000000000000000000000000' → native ETH
  - Use `newOfferETH` / `fillOfferETH` with `{ value: amount }`
- Otherwise → ERC20
  - Use `newOffer` / `fillOffer` (need approval first)

### 6. Referral-Enabled Chains
From cli-constants.ts FUND_DISTRIBUTOR_ADDRESS:
- Chains with fund distributor = referral enabled
- Use PreMarketAbiRef for these chains
- cancelOffer/settleFilled take extra args: `(index, encodedData, fundDistributor)`

### 7. Amount/Price Precision
- WEI6 = 1_000_000 for token amounts (same as Solana)
- ERC20 decimals vary (6 for USDC, 18 for most tokens)
- Use `parseUnits(amount, decimals)` for collateral values

## Functions to Implement

### EvmTrading class
```typescript
class EvmTrading {
  // Core
  constructor(privateKey: string, chainId: number)
  
  // Trading
  async createOffer(tokenId: string, amount: number, price: number, side: 'buy'|'sell', exTokenAddress: string, isFullMatch: boolean): Promise<{txHash: string}>
  async fillOffer(offerIndex: number, amount: number, exTokenAddress: string, value: number): Promise<{txHash: string}>
  async closeOffer(offerIndex: number): Promise<{txHash: string}>
  async cancelOrder(orderIndex: number): Promise<{txHash: string}>
  
  // Read
  async getOffer(offerIndex: number, exTokenAddress: string): Promise<OfferDetail>
  async getOrder(orderIndex: number): Promise<OrderDetail>
  
  // Helpers
  private async checkAndApprove(tokenAddress: string, amount: bigint): Promise<void>
  private isNativeToken(address: string): boolean
  private isReferralEnabled(): boolean
  private getAbi(): any[]
  private getFundDistributor(): string
}
```

## Env Vars
- `WM_AGENT_PRIVATE_KEY` — used for both Solana (bs58) AND EVM (hex). Auto-detect by format:
  - Starts with `0x` or is 64 hex chars → EVM
  - Otherwise → Solana (bs58)
- `WM_EVM_CHAIN_ID` — default EVM chain (optional, can be auto-detected from token)
- Existing vars all still apply: `WM_SPEND_LIMIT_PER_TX`, `WM_DAILY_LIMIT`, etc.

## IMPORTANT: Wallet Type Auto-Detection
Currently `WM_WALLET_TYPE` is set manually. For multi-chain support:
- When a trading tool is called, get the token's `chain_id` from API
- Route to Solana or EVM trading based on chain_id
- Private key format determines wallet type:
  - bs58 encoded (starts with a number/letter, ~88 chars) → Solana
  - hex (starts with 0x, 66 chars or 64 chars without 0x) → EVM

## Safety Requirements (same as Solana)
1. Spend limit checks before execution
2. Balance check before trade
3. Simulate/estimate gas before sending
4. dry_run parameter support
5. Price sanity check
6. All existing safety from wallet.ts applies

## Dependencies
- `ethers` (already installed)
- `viem` — NOT needed, use ethers only to keep deps minimal

## Testing
- Use Base Sepolia (chainId 84532) or BSC Testnet (chainId 97) for testing
- Contract addresses from cli-constants.ts testnet section
- Get testnet tokens from respective faucets

## Do NOT
- Do NOT use viem — stick with ethers.js (already a dependency)
- Do NOT break existing Solana trading
- Do NOT change existing tool names — just make them chain-aware
- Do NOT import from frontend paths — copy what you need
