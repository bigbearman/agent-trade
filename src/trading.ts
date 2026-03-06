import { PublicKey } from '@solana/web3.js';
import type { WhalesMarketAPI } from './api-client.js';
import type { WalletManager } from './wallet.js';
import type { TradeIntent, TradeResult, OrderBookEntry, OrderBookResult } from './types.js';
import { getSolanaTrading } from './solana-trading.js';
import { getEvmTrading } from './evm-trading.js';
import { isSolanaChain, isEvmChain, ETH_ADDRESS as EVM_ETH_ADDRESS, EVM_CHAINS } from './evm-constants.js';
import { WEI6 } from './constants.js';
import { ethers } from 'ethers';

// ── Order Book ───────────────────────────────────────────

function parseOffer(offer: Record<string, unknown>): OrderBookEntry {
  const totalAmount = parseFloat(String(offer.total_amount || 0));
  const filledAmount = parseFloat(String(offer.filled_amount || 0));
  const remaining = totalAmount - filledAmount;

  let price = 0;
  if (offer.offer_price_usd != null) {
    price = parseFloat(String(offer.offer_price_usd));
  } else if (offer.price) {
    price = parseFloat(String(offer.price));
  } else if (offer.collateral && totalAmount > 0) {
    price = parseFloat(String(offer.collateral)) / totalAmount;
  }

  let fillStatus = 'Open';
  if (filledAmount > 0 && filledAmount < totalAmount) fillStatus = 'Partial';
  else if (filledAmount >= totalAmount && totalAmount > 0) fillStatus = 'Filled';

  const matchType = offer.full_match === true ? 'Full' : 'Partial';

  return {
    id: String(offer.id || offer.offer_index || '-'),
    price,
    size: totalAmount,
    filled: filledAmount,
    remaining,
    fillStatus,
    matchType,
    value: remaining * price,
    type: String(offer.type || offer.offer_type || ''),
  };
}

export function buildOrderBook(offers: Record<string, unknown>[], symbol: string, depth: number): OrderBookResult {
  const buyOrders = offers
    .filter((o) => o.type === 'buy' || o.offer_type === 'buy')
    .map(parseOffer)
    .sort((a, b) => b.price - a.price)
    .slice(0, depth);

  const sellOrders = offers
    .filter((o) => o.type === 'sell' || o.offer_type === 'sell')
    .map(parseOffer)
    .sort((a, b) => a.price - b.price)
    .slice(0, depth);

  const bestBid = buyOrders.length > 0 ? buyOrders[0].price : 0;
  const bestAsk = sellOrders.length > 0 ? sellOrders[0].price : 0;
  const spread = bestAsk && bestBid ? bestAsk - bestBid : 0;
  const spreadPercent = bestBid > 0 ? (spread / bestBid) * 100 : 0;

  return { symbol, buyOrders, sellOrders, bestBid, bestAsk, spread, spreadPercent };
}

// ── Chain Detection ──────────────────────────────────────

export interface TokenChainInfo {
  chainId: number;
  isSolana: boolean;
  isEvm: boolean;
  tokenId: string;
  exTokenAddress: string;
  decimals: number;
}

export async function resolveTokenChainInfo(
  api: WhalesMarketAPI,
  symbol: string,
): Promise<TokenChainInfo> {
  const detail = await api.getTokenDetail(symbol);
  const tokenData = detail?.data || detail;

  // chain_id can be a number, string, or array (e.g. [999999]) from the API
  const rawChainId = tokenData.chain_id;
  const chainIdValue = Array.isArray(rawChainId) ? rawChainId[0] : rawChainId;
  const chainId = parseInt(String(chainIdValue || '666666'), 10);
  const tokenId = String(tokenData.token_id || tokenData.id || '0');
  const exTokenAddress = String(
    tokenData.ex_token_address || tokenData.exTokenAddress || PublicKey.default.toString(),
  );
  const decimals = parseInt(String(tokenData.decimals || tokenData.ex_token_decimals || '6'), 10);

  return {
    chainId,
    isSolana: isSolanaChain(chainId),
    isEvm: isEvmChain(chainId),
    tokenId,
    exTokenAddress,
    decimals,
  };
}

// ── Price Sanity Check ───────────────────────────────────

export async function checkPriceSanity(
  api: WhalesMarketAPI,
  symbol: string,
  price: number,
  maxDeviation = 0.1,
): Promise<{ sane: boolean; lastPrice?: number; deviation?: number; reason?: string }> {
  try {
    const detail = await api.getTokenDetail(symbol);
    const lastPrice = parseFloat(detail?.data?.last_price || detail?.last_price || '0');
    if (lastPrice <= 0) {
      return { sane: true, lastPrice: 0 };
    }
    const deviation = Math.abs(price - lastPrice) / lastPrice;
    if (deviation > maxDeviation) {
      return {
        sane: false,
        lastPrice,
        deviation,
        reason: `Price $${price} deviates ${(deviation * 100).toFixed(1)}% from last price $${lastPrice} (max ${maxDeviation * 100}%)`,
      };
    }
    return { sane: true, lastPrice, deviation };
  } catch {
    // FAIL-CLOSED: If we can't fetch price, block the trade for safety
    return {
      sane: false,
      reason: 'Unable to verify market price (API unreachable). Trade blocked for safety. Use dry_run=true to preview.',
    };
  }
}

// ── Create Offer (Buy or Sell) — On-Chain ────────────────

export async function executeTradeIntent(
  api: WhalesMarketAPI,
  wallet: WalletManager,
  intent: TradeIntent,
): Promise<TradeResult> {
  const { symbol, amount, price, side, dryRun } = intent;
  const totalValue = amount * price;

  // Agent mode: validate + execute on-chain
  if (wallet.isAgentMode) {
    // Check spend limits
    const limitCheck = wallet.checkSpendLimits(totalValue);
    if (!limitCheck.allowed) {
      return {
        success: false,
        mode: 'agent',
        intent: { ...intent, totalValue },
        executed: false,
        error: limitCheck.reason,
      };
    }

    // Price sanity check
    const sanity = await checkPriceSanity(api, symbol, price);
    if (!sanity.sane) {
      return {
        success: false,
        mode: 'agent',
        intent: { ...intent, totalValue },
        executed: false,
        error: sanity.reason,
      };
    }

    // Resolve chain info from token
    let chainInfo: TokenChainInfo;
    try {
      chainInfo = await resolveTokenChainInfo(api, symbol);
    } catch (error) {
      return {
        success: false,
        mode: 'agent',
        intent: { ...intent, totalValue },
        executed: false,
        error: `Failed to resolve token params: ${error instanceof Error ? error.message : String(error)}`,
      };
    }

    // ── EVM chain path ────────────────────────────────
    if (chainInfo.isEvm) {
      try {
        const evmTrading = getEvmTrading(chainInfo.chainId);
        const result = await evmTrading.createOffer(
          chainInfo.tokenId,
          amount,
          price,
          side,
          chainInfo.exTokenAddress,
          false, // isFullMatch
          dryRun,
        );

        if (result.success && !dryRun) {
          wallet.recordSpend(totalValue);
        }

        if (dryRun && result.success) {
          return {
            success: true,
            mode: 'agent',
            intent: { ...intent, totalValue },
            executed: false,
            preview: {
              message: `[DRY RUN] Simulation passed for ${side} offer: ${amount} ${symbol} @ $${price} = $${totalValue.toFixed(2)} on ${result.chainName}`,
            },
            result: {
              simulation: result.simulation,
              network: evmTrading.getNetworkInfo(),
            },
          };
        }

        return {
          success: result.success,
          mode: 'agent',
          intent: { ...intent, totalValue },
          executed: result.success,
          result: {
            txHash: result.txHash,
            explorerUrl: result.explorerUrl,
            network: evmTrading.getNetworkInfo(),
          },
          error: result.error,
        };
      } catch (error) {
        return {
          success: false,
          mode: 'agent',
          intent: { ...intent, totalValue },
          executed: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }

    // ── Solana chain path (existing logic) ────────────
    const tokenId = parseInt(chainInfo.tokenId, 10);
    const exTokenAddress = chainInfo.exTokenAddress;
    const decimals = chainInfo.decimals;

    // Convert amount and price to on-chain units
    const amountOnChain = Math.round(amount * WEI6);
    const priceOnChain = Math.round(price * Math.pow(10, decimals));

    const exTokenPubkey = new PublicKey(exTokenAddress);

    if (dryRun) {
      try {
        const solTrading = getSolanaTrading();
        const result = await solTrading.createOffer(
          tokenId,
          side,
          exTokenPubkey,
          amountOnChain,
          priceOnChain,
          false,
          true,
        );
        return {
          success: true,
          mode: 'agent',
          intent: { ...intent, totalValue },
          executed: false,
          preview: {
            message: `[DRY RUN] Simulation passed for ${side} offer: ${amount} ${symbol} @ $${price} = $${totalValue.toFixed(2)}`,
          },
          result: {
            simulation: result.simulation,
            network: getSolanaTrading().getNetworkInfo(),
          },
        };
      } catch (error) {
        return {
          success: false,
          mode: 'agent',
          intent: { ...intent, totalValue },
          executed: false,
          error: `Simulation failed: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    }

    try {
      const solTrading = getSolanaTrading();
      const result = await solTrading.createOffer(
        tokenId,
        side,
        exTokenPubkey,
        amountOnChain,
        priceOnChain,
        false,
        false,
      );

      if (result.success) {
        wallet.recordSpend(totalValue);
      }

      return {
        success: result.success,
        mode: 'agent',
        intent: { ...intent, totalValue },
        executed: result.success,
        result: {
          txHash: result.txHash,
          network: solTrading.getNetworkInfo(),
        },
        error: result.error,
      };
    } catch (error) {
      return {
        success: false,
        mode: 'agent',
        intent: { ...intent, totalValue },
        executed: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  // User mode: return preview
  return {
    success: true,
    mode: 'user',
    intent: { ...intent, totalValue },
    executed: false,
    preview: {
      message: `Preview: ${side} ${amount} ${symbol} @ $${price} = $${totalValue.toFixed(2)}. Execute on whales.market to complete.`,
      approvalUrl: `https://whales.market`,
    },
  };
}

// ── React to Offer (Fill) — On-Chain ─────────────────────

export async function reactToOffer(
  api: WhalesMarketAPI,
  wallet: WalletManager,
  offerId: string,
  amount: number | undefined,
  dryRun: boolean,
  chainId?: number,
): Promise<TradeResult> {
  const intent: TradeIntent = {
    symbol: '',
    amount: amount || 0,
    price: 0,
    side: 'buy',
    totalValue: 0,
    dryRun,
  };

  if (wallet.isAgentMode) {
    const offerIndex = parseInt(offerId, 10);
    if (isNaN(offerIndex)) {
      return {
        success: false,
        mode: 'agent',
        intent,
        executed: false,
        error: `Invalid offer ID: ${offerId} — must be a numeric on-chain offer index`,
      };
    }

    // ── EVM path ────────────────────────────────
    if (chainId && isEvmChain(chainId)) {
      try {
        const evmTrading = getEvmTrading(chainId);
        const onChainOffer = await evmTrading.getOffer(offerIndex);

        // Calculate fill amount
        const totalAmount = BigInt(onChainOffer.amount);
        const filledAmount = BigInt(onChainOffer.filledAmount);
        const remaining = totalAmount - filledAmount;
        const fillAmountWei6 = amount ? BigInt(Math.round(amount * WEI6)) : remaining;
        const fillAmountHuman = Number(fillAmountWei6) / WEI6;

        // Calculate value to send based on offer collateral ratio
        const offerValue = BigInt(onChainOffer.value);
        const fillValue = (offerValue * fillAmountWei6) / totalAmount;

        const result = await evmTrading.fillOffer(
          offerIndex,
          fillAmountHuman,
          onChainOffer.exToken,
          fillValue,
          dryRun,
        );

        if (dryRun && result.success) {
          return {
            success: true,
            mode: 'agent',
            intent,
            executed: false,
            preview: {
              message: `[DRY RUN] Simulation passed for filling offer #${offerId} with amount ${fillAmountHuman} on ${result.chainName}`,
            },
            result: {
              onChainOffer,
              simulation: result.simulation,
              network: evmTrading.getNetworkInfo(),
            },
          };
        }

        return {
          success: result.success,
          mode: 'agent',
          intent,
          executed: result.success,
          result: {
            txHash: result.txHash,
            explorerUrl: result.explorerUrl,
            onChainOffer,
            network: evmTrading.getNetworkInfo(),
          },
          error: result.error,
        };
      } catch (error) {
        return {
          success: false,
          mode: 'agent',
          intent,
          executed: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }

    // ── Solana path (existing logic) ────────────
    try {
      const solTrading = getSolanaTrading();
      const onChainOffer = await solTrading.getOnChainOffer(offerIndex);

      const totalAmount = parseInt(onChainOffer.totalAmount, 10);
      const filledAmount = parseInt(onChainOffer.filledAmount, 10);
      const remaining = totalAmount - filledAmount;
      const fillAmount = amount
        ? Math.round(amount * WEI6)
        : remaining;

      if (dryRun) {
        const result = await solTrading.fillOffer(offerIndex, fillAmount, true);
        return {
          success: true,
          mode: 'agent',
          intent,
          executed: false,
          preview: {
            message: `[DRY RUN] Simulation passed for filling offer #${offerId} with amount ${fillAmount / WEI6}`,
          },
          result: {
            onChainOffer,
            simulation: result.simulation,
            network: solTrading.getNetworkInfo(),
          },
        };
      }

      const result = await solTrading.fillOffer(offerIndex, fillAmount, false);

      return {
        success: result.success,
        mode: 'agent',
        intent,
        executed: result.success,
        result: {
          txHash: result.txHash,
          onChainOffer,
          network: solTrading.getNetworkInfo(),
        },
        error: result.error,
      };
    } catch (error) {
      return {
        success: false,
        mode: 'agent',
        intent,
        executed: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  return {
    success: true,
    mode: 'user',
    intent,
    executed: false,
    preview: {
      message: `Preview: React to offer ${offerId}. Execute on whales.market to complete.`,
      approvalUrl: `https://whales.market`,
    },
  };
}

// ── Cancel Offer (Close Unfilled) — On-Chain ─────────────

export async function cancelOffer(
  api: WhalesMarketAPI,
  wallet: WalletManager,
  offerId: string,
  dryRun: boolean,
  chainId?: number,
): Promise<TradeResult> {
  const intent: TradeIntent = {
    symbol: '',
    amount: 0,
    price: 0,
    side: 'buy',
    totalValue: 0,
    dryRun,
  };

  if (wallet.isAgentMode) {
    const offerIndex = parseInt(offerId, 10);
    if (isNaN(offerIndex)) {
      return {
        success: false,
        mode: 'agent',
        intent,
        executed: false,
        error: `Invalid offer ID: ${offerId} — must be a numeric on-chain offer index`,
      };
    }

    // ── EVM path ────────────────────────────────
    if (chainId && isEvmChain(chainId)) {
      try {
        const evmTrading = getEvmTrading(chainId);
        const result = await evmTrading.closeOffer(offerIndex, dryRun);

        if (dryRun && result.success) {
          return {
            success: true,
            mode: 'agent',
            intent,
            executed: false,
            preview: {
              message: `[DRY RUN] Simulation passed for closing offer #${offerId} on ${result.chainName}`,
            },
            result: {
              simulation: result.simulation,
              network: evmTrading.getNetworkInfo(),
            },
          };
        }

        return {
          success: result.success,
          mode: 'agent',
          intent,
          executed: result.success,
          result: {
            txHash: result.txHash,
            explorerUrl: result.explorerUrl,
            network: evmTrading.getNetworkInfo(),
          },
          error: result.error,
        };
      } catch (error) {
        return {
          success: false,
          mode: 'agent',
          intent,
          executed: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }

    // ── Solana path (existing logic) ────────────
    try {
      const solTrading = getSolanaTrading();

      if (dryRun) {
        const result = await solTrading.closeOffer(offerIndex, true);
        return {
          success: true,
          mode: 'agent',
          intent,
          executed: false,
          preview: {
            message: `[DRY RUN] Simulation passed for closing offer #${offerId}`,
          },
          result: {
            simulation: result.simulation,
            network: solTrading.getNetworkInfo(),
          },
        };
      }

      const result = await solTrading.closeOffer(offerIndex, false);

      return {
        success: result.success,
        mode: 'agent',
        intent,
        executed: result.success,
        result: {
          txHash: result.txHash,
          network: solTrading.getNetworkInfo(),
        },
        error: result.error,
      };
    } catch (error) {
      return {
        success: false,
        mode: 'agent',
        intent,
        executed: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  return {
    success: true,
    mode: 'user',
    intent,
    executed: false,
    preview: {
      message: `Preview: Cancel offer ${offerId}. Execute on whales.market to complete.`,
      approvalUrl: `https://whales.market`,
    },
  };
}

// ── Cancel Order — On-Chain ──────────────────────────────

export async function cancelOrder(
  api: WhalesMarketAPI,
  wallet: WalletManager,
  orderId: string,
  dryRun: boolean,
  chainId?: number,
): Promise<TradeResult> {
  const intent: TradeIntent = {
    symbol: '',
    amount: 0,
    price: 0,
    side: 'buy',
    totalValue: 0,
    dryRun,
  };

  if (wallet.isAgentMode) {
    const orderIndex = parseInt(orderId, 10);
    if (isNaN(orderIndex)) {
      return {
        success: false,
        mode: 'agent',
        intent,
        executed: false,
        error: `Invalid order ID: ${orderId} — must be a numeric on-chain order index`,
      };
    }

    // ── EVM path ────────────────────────────────
    if (chainId && isEvmChain(chainId)) {
      try {
        const evmTrading = getEvmTrading(chainId);
        const result = await evmTrading.cancelOrder(orderIndex, dryRun);

        if (dryRun && result.success) {
          return {
            success: true,
            mode: 'agent',
            intent,
            executed: false,
            preview: {
              message: `[DRY RUN] Simulation passed for cancelling order #${orderId} on ${result.chainName}`,
            },
            result: {
              simulation: result.simulation,
              network: evmTrading.getNetworkInfo(),
            },
          };
        }

        return {
          success: result.success,
          mode: 'agent',
          intent,
          executed: result.success,
          result: {
            txHash: result.txHash,
            explorerUrl: result.explorerUrl,
            network: evmTrading.getNetworkInfo(),
          },
          error: result.error,
        };
      } catch (error) {
        return {
          success: false,
          mode: 'agent',
          intent,
          executed: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }

    // ── Solana path ────────────────────────────
    try {
      const solTrading = getSolanaTrading();

      if (dryRun) {
        const result = await solTrading.cancelOrder(orderIndex, true);
        return {
          success: true,
          mode: 'agent',
          intent,
          executed: false,
          preview: {
            message: `[DRY RUN] Simulation passed for cancelling order #${orderId}`,
          },
          result: {
            simulation: result.simulation,
            network: solTrading.getNetworkInfo(),
          },
        };
      }

      const result = await solTrading.cancelOrder(orderIndex, false);

      return {
        success: result.success,
        mode: 'agent',
        intent,
        executed: result.success,
        result: {
          txHash: result.txHash,
          network: solTrading.getNetworkInfo(),
        },
        error: result.error,
      };
    } catch (error) {
      return {
        success: false,
        mode: 'agent',
        intent,
        executed: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  return {
    success: true,
    mode: 'user',
    intent,
    executed: false,
    preview: {
      message: `Preview: Cancel order ${orderId}. Execute on whales.market to complete.`,
      approvalUrl: `https://whales.market`,
    },
  };
}
