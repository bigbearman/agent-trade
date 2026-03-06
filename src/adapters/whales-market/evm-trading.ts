// EVM Pre-Market Trading — server-side implementation using ethers.js
// Ported from frontend SDK (EvmPreMarketContract.ts) for headless agent use

import { ethers, AbiCoder } from 'ethers';
import {
  EVM_CHAINS,
  ETH_ADDRESS,
  PRE_MARKET_ADDRESS,
  FUND_DISTRIBUTOR_ADDRESS,
  getEvmRpcUrl,
} from './evm-constants.js';
import { abiPreMarket } from './abi/PreMarketAbi.js';
import { abiPreMarketRef } from './abi/PreMarketAbiRef.js';
import { WEI6 } from './constants.js';

// ── ERC20 minimal ABI ────────────────────────────────────

const ERC20_ABI = [
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
];

// ── Types ────────────────────────────────────────────────

export interface EvmTradeResult {
  success: boolean;
  txHash?: string;
  error?: string;
  chainId: number;
  chainName: string;
  explorerUrl?: string;
  simulation?: {
    success: boolean;
    gasEstimate?: string;
    error?: string;
  };
}

export interface EvmOnChainOffer {
  offerType: number;
  tokenId: string;
  exToken: string;
  amount: string;
  value: string;
  collateral: string;
  filledAmount: string;
  status: number;
  offeredBy: string;
  fullMatch: boolean;
}

export interface EvmOnChainOrder {
  offerId: string;
  amount: string;
  seller: string;
  buyer: string;
  status: number;
}

// ── Offer/Order status enums ─────────────────────────────

const OFFER_STATUS: Record<number, string> = {
  1: 'Open',
  2: 'Closed',
  3: 'Cancelled',
};

const ORDER_STATUS: Record<number, string> = {
  1: 'Open',
  2: 'Settled',
  3: 'Cancelled',
};

// ── Main EVM Trading Class ───────────────────────────────

export class EvmTrading {
  private provider: ethers.JsonRpcProvider;
  private wallet: ethers.Wallet;
  private chainId: number;
  private contractAddress: string;
  private fundDistributorAddress: string | undefined;
  private referralEnabled: boolean;
  private contract: ethers.Contract;

  constructor(privateKey: string, chainId: number) {
    this.chainId = chainId;

    const chainConfig = EVM_CHAINS[chainId];
    if (!chainConfig) {
      throw new Error(`Unsupported EVM chain ID: ${chainId}`);
    }

    const rpcUrl = getEvmRpcUrl(chainId);
    if (!rpcUrl) {
      throw new Error(`No RPC URL for chain ${chainId} (${chainConfig.name})`);
    }

    this.contractAddress = PRE_MARKET_ADDRESS[chainId];
    if (!this.contractAddress) {
      throw new Error(`No pre-market contract deployed on chain ${chainId} (${chainConfig.name})`);
    }

    this.fundDistributorAddress = FUND_DISTRIBUTOR_ADDRESS[chainId];
    this.referralEnabled = !!this.fundDistributorAddress;

    this.provider = new ethers.JsonRpcProvider(rpcUrl);
    this.wallet = new ethers.Wallet(privateKey, this.provider);

    // Select ABI based on referral support
    const abi = this.referralEnabled ? abiPreMarketRef : abiPreMarket;
    this.contract = new ethers.Contract(this.contractAddress, abi, this.wallet);
  }

  // ── Getters ────────────────────────────────────────────

  getChainName(): string {
    return EVM_CHAINS[this.chainId]?.name ?? `Chain ${this.chainId}`;
  }

  getExplorerUrl(): string {
    return EVM_CHAINS[this.chainId]?.explorerUrl ?? '';
  }

  getAddress(): string {
    return this.wallet.address;
  }

  getNetworkInfo(): { chainId: number; chainName: string; contractAddress: string; explorerUrl: string; referralEnabled: boolean } {
    return {
      chainId: this.chainId,
      chainName: this.getChainName(),
      contractAddress: this.contractAddress,
      explorerUrl: this.getExplorerUrl(),
      referralEnabled: this.referralEnabled,
    };
  }

  // ── Native token check ─────────────────────────────────

  private isNativeToken(address: string): boolean {
    return address.toLowerCase() === ETH_ADDRESS.toLowerCase();
  }

  // ── ERC20 helpers ──────────────────────────────────────

  private async getTokenDecimals(tokenAddress: string): Promise<number> {
    if (this.isNativeToken(tokenAddress)) {
      return EVM_CHAINS[this.chainId]?.nativeCurrency.decimals ?? 18;
    }
    const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, this.provider);
    return Number(await tokenContract.decimals());
  }

  private async getTokenBalance(tokenAddress: string): Promise<bigint> {
    if (this.isNativeToken(tokenAddress)) {
      return await this.provider.getBalance(this.wallet.address);
    }
    const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, this.provider);
    return await tokenContract.balanceOf(this.wallet.address);
  }

  private async checkAndApprove(tokenAddress: string, amount: bigint): Promise<string | null> {
    if (this.isNativeToken(tokenAddress)) return null;

    const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, this.wallet);
    const currentAllowance: bigint = await tokenContract.allowance(this.wallet.address, this.contractAddress);

    if (currentAllowance >= amount) return null;

    // USDT special case: must reset to 0 first
    const usdtAddresses = [
      '0xdAC17F958D2ee523a2206206994597C13D831ec7'.toLowerCase(),
      '0xdac17f958d2ee523a2206206994597c13d831ec7',
    ];
    if (usdtAddresses.includes(tokenAddress.toLowerCase()) && currentAllowance > 0n) {
      const resetTx = await tokenContract.approve(this.contractAddress, 0n);
      await resetTx.wait();
    }

    // Approve exact amount + 10% buffer (safer than MaxUint256 for agent wallets)
    const approvalAmount = amount + (amount / 10n);
    const approveTx = await tokenContract.approve(this.contractAddress, approvalAmount);
    const receipt = await approveTx.wait();
    return receipt?.hash ?? null;
  }

  // ── Create Offer ───────────────────────────────────────

  async createOffer(
    tokenId: string,
    amount: number,
    price: number,
    side: 'buy' | 'sell',
    exTokenAddress: string,
    isFullMatch: boolean,
    dryRun: boolean = false,
  ): Promise<EvmTradeResult> {
    try {
      const offerType = side === 'buy' ? 1 : 2;
      const decimals = await this.getTokenDecimals(exTokenAddress);

      // Convert amount to WEI6 (6 decimals for token amount)
      const amountWei6 = BigInt(Math.round(amount * WEI6));

      // Calculate collateral value: amount * price in exToken decimals
      const totalValue = amount * price;
      const valueInExToken = ethers.parseUnits(totalValue.toFixed(decimals), decimals);

      // Check balance
      const balance = await this.getTokenBalance(exTokenAddress);
      if (balance < valueInExToken) {
        const balanceFormatted = ethers.formatUnits(balance, decimals);
        const needed = ethers.formatUnits(valueInExToken, decimals);
        return {
          success: false,
          chainId: this.chainId,
          chainName: this.getChainName(),
          error: `Insufficient balance: have ${balanceFormatted}, need ${needed}`,
        };
      }

      // Approve ERC20 if needed
      if (!this.isNativeToken(exTokenAddress)) {
        await this.checkAndApprove(exTokenAddress, valueInExToken);
      }

      // Convert tokenId to bytes32 — contract expects numeric token index, not UUID
      // ethers auto-pads number → bytes32. If tokenId is numeric string, convert to number.
      // If it's a UUID, strip dashes and use as hex (16 bytes fits in bytes32).
      let tokenIdParam: number | string;
      const numericId = parseInt(tokenId, 10);
      if (!isNaN(numericId) && String(numericId) === tokenId) {
        tokenIdParam = numericId;
      } else if (tokenId.includes('-')) {
        // UUID format: strip dashes, prefix 0x, zero-pad to bytes32
        tokenIdParam = ethers.zeroPadValue('0x' + tokenId.replace(/-/g, ''), 32);
      } else {
        tokenIdParam = tokenId;
      }

      if (this.isNativeToken(exTokenAddress)) {
        // Native token: use newOfferETH with value
        if (dryRun) {
          const gasEstimate = await this.contract.newOfferETH.estimateGas(
            offerType, tokenIdParam, amountWei6, valueInExToken, isFullMatch,
            { value: valueInExToken },
          );
          return {
            success: true,
            chainId: this.chainId,
            chainName: this.getChainName(),
            simulation: { success: true, gasEstimate: gasEstimate.toString() },
          };
        }

        const tx = await this.contract.newOfferETH(
          offerType, tokenIdParam, amountWei6, valueInExToken, isFullMatch,
          { value: valueInExToken },
        );
        const receipt = await tx.wait();
        return {
          success: true,
          txHash: receipt.hash,
          chainId: this.chainId,
          chainName: this.getChainName(),
          explorerUrl: `${this.getExplorerUrl()}/tx/${receipt.hash}`,
        };
      } else {
        // ERC20: use newOffer
        if (dryRun) {
          const gasEstimate = await this.contract.newOffer.estimateGas(
            offerType, tokenIdParam, amountWei6, valueInExToken, exTokenAddress, isFullMatch,
          );
          return {
            success: true,
            chainId: this.chainId,
            chainName: this.getChainName(),
            simulation: { success: true, gasEstimate: gasEstimate.toString() },
          };
        }

        const tx = await this.contract.newOffer(
          offerType, tokenIdParam, amountWei6, valueInExToken, exTokenAddress, isFullMatch,
        );
        const receipt = await tx.wait();
        return {
          success: true,
          txHash: receipt.hash,
          chainId: this.chainId,
          chainName: this.getChainName(),
          explorerUrl: `${this.getExplorerUrl()}/tx/${receipt.hash}`,
        };
      }
    } catch (error) {
      return {
        success: false,
        chainId: this.chainId,
        chainName: this.getChainName(),
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  // ── Fill Offer ─────────────────────────────────────────

  async fillOffer(
    offerIndex: number,
    amount: number,
    exTokenAddress: string,
    fillValue: bigint,
    dryRun: boolean = false,
  ): Promise<EvmTradeResult> {
    try {
      const amountWei6 = BigInt(Math.round(amount * WEI6));

      // Check balance
      const balance = await this.getTokenBalance(exTokenAddress);
      if (balance < fillValue) {
        const decimals = await this.getTokenDecimals(exTokenAddress);
        return {
          success: false,
          chainId: this.chainId,
          chainName: this.getChainName(),
          error: `Insufficient balance: have ${ethers.formatUnits(balance, decimals)}, need ${ethers.formatUnits(fillValue, decimals)}`,
        };
      }

      // Approve ERC20 if needed
      if (!this.isNativeToken(exTokenAddress)) {
        await this.checkAndApprove(exTokenAddress, fillValue);
      }

      if (this.isNativeToken(exTokenAddress)) {
        if (dryRun) {
          const gasEstimate = await this.contract.fillOfferETH.estimateGas(
            offerIndex, amountWei6, { value: fillValue },
          );
          return {
            success: true,
            chainId: this.chainId,
            chainName: this.getChainName(),
            simulation: { success: true, gasEstimate: gasEstimate.toString() },
          };
        }

        const tx = await this.contract.fillOfferETH(
          offerIndex, amountWei6, { value: fillValue },
        );
        const receipt = await tx.wait();
        return {
          success: true,
          txHash: receipt.hash,
          chainId: this.chainId,
          chainName: this.getChainName(),
          explorerUrl: `${this.getExplorerUrl()}/tx/${receipt.hash}`,
        };
      } else {
        if (dryRun) {
          const gasEstimate = await this.contract.fillOffer.estimateGas(
            offerIndex, amountWei6,
          );
          return {
            success: true,
            chainId: this.chainId,
            chainName: this.getChainName(),
            simulation: { success: true, gasEstimate: gasEstimate.toString() },
          };
        }

        const tx = await this.contract.fillOffer(offerIndex, amountWei6);
        const receipt = await tx.wait();
        return {
          success: true,
          txHash: receipt.hash,
          chainId: this.chainId,
          chainName: this.getChainName(),
          explorerUrl: `${this.getExplorerUrl()}/tx/${receipt.hash}`,
        };
      }
    } catch (error) {
      return {
        success: false,
        chainId: this.chainId,
        chainName: this.getChainName(),
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  // ── Close Offer (cancelOffer on contract) ──────────────

  async closeOffer(
    offerIndex: number,
    dryRun: boolean = false,
  ): Promise<EvmTradeResult> {
    try {
      if (this.referralEnabled) {
        // Referral chain: cancelOffer(offerId, data, fundDistributor)
        const emptyData = '0x';
        if (dryRun) {
          const gasEstimate = await this.contract.cancelOffer.estimateGas(
            offerIndex, emptyData, this.fundDistributorAddress!,
          );
          return {
            success: true,
            chainId: this.chainId,
            chainName: this.getChainName(),
            simulation: { success: true, gasEstimate: gasEstimate.toString() },
          };
        }

        const tx = await this.contract.cancelOffer(
          offerIndex, emptyData, this.fundDistributorAddress!,
        );
        const receipt = await tx.wait();
        return {
          success: true,
          txHash: receipt.hash,
          chainId: this.chainId,
          chainName: this.getChainName(),
          explorerUrl: `${this.getExplorerUrl()}/tx/${receipt.hash}`,
        };
      } else {
        // Non-referral chain: cancelOffer(offerId)
        if (dryRun) {
          const gasEstimate = await this.contract.cancelOffer.estimateGas(offerIndex);
          return {
            success: true,
            chainId: this.chainId,
            chainName: this.getChainName(),
            simulation: { success: true, gasEstimate: gasEstimate.toString() },
          };
        }

        const tx = await this.contract.cancelOffer(offerIndex);
        const receipt = await tx.wait();
        return {
          success: true,
          txHash: receipt.hash,
          chainId: this.chainId,
          chainName: this.getChainName(),
          explorerUrl: `${this.getExplorerUrl()}/tx/${receipt.hash}`,
        };
      }
    } catch (error) {
      return {
        success: false,
        chainId: this.chainId,
        chainName: this.getChainName(),
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  // ── Cancel Order (settleCancelled on contract) ─────────

  async cancelOrder(
    orderIndex: number,
    dryRun: boolean = false,
  ): Promise<EvmTradeResult> {
    try {
      if (this.referralEnabled) {
        // Referral chain: settleCancelled(orderId, data, fundDistributor)
        const emptyData = '0x';
        if (dryRun) {
          const gasEstimate = await this.contract.settleCancelled.estimateGas(
            orderIndex, emptyData, this.fundDistributorAddress!,
          );
          return {
            success: true,
            chainId: this.chainId,
            chainName: this.getChainName(),
            simulation: { success: true, gasEstimate: gasEstimate.toString() },
          };
        }

        const tx = await this.contract.settleCancelled(
          orderIndex, emptyData, this.fundDistributorAddress!,
        );
        const receipt = await tx.wait();
        return {
          success: true,
          txHash: receipt.hash,
          chainId: this.chainId,
          chainName: this.getChainName(),
          explorerUrl: `${this.getExplorerUrl()}/tx/${receipt.hash}`,
        };
      } else {
        // Non-referral chain: settleCancelled(orderId)
        if (dryRun) {
          const gasEstimate = await this.contract.settleCancelled.estimateGas(orderIndex);
          return {
            success: true,
            chainId: this.chainId,
            chainName: this.getChainName(),
            simulation: { success: true, gasEstimate: gasEstimate.toString() },
          };
        }

        const tx = await this.contract.settleCancelled(orderIndex);
        const receipt = await tx.wait();
        return {
          success: true,
          txHash: receipt.hash,
          chainId: this.chainId,
          chainName: this.getChainName(),
          explorerUrl: `${this.getExplorerUrl()}/tx/${receipt.hash}`,
        };
      }
    } catch (error) {
      return {
        success: false,
        chainId: this.chainId,
        chainName: this.getChainName(),
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  // ── Read on-chain offer ────────────────────────────────

  async getOffer(offerIndex: number): Promise<EvmOnChainOffer> {
    const offer = await this.contract.offers(offerIndex);
    return {
      offerType: Number(offer.offerType),
      tokenId: offer.tokenId,
      exToken: offer.exToken,
      amount: offer.amount.toString(),
      value: offer.value.toString(),
      collateral: offer.collateral.toString(),
      filledAmount: offer.filledAmount.toString(),
      status: Number(offer.status),
      offeredBy: offer.offeredBy,
      fullMatch: offer.fullMatch,
    };
  }

  // ── Read on-chain order ────────────────────────────────

  async getOrder(orderIndex: number): Promise<EvmOnChainOrder> {
    const order = await this.contract.orders(orderIndex);
    return {
      offerId: order.offerId.toString(),
      amount: order.amount.toString(),
      seller: order.seller,
      buyer: order.buyer,
      status: Number(order.status),
    };
  }

  // ── Get balance for display ────────────────────────────

  async getBalance(tokenAddress?: string): Promise<{ balance: string; symbol: string; decimals: number }> {
    const addr = tokenAddress || ETH_ADDRESS;
    if (this.isNativeToken(addr)) {
      const balance = await this.provider.getBalance(this.wallet.address);
      const chainConfig = EVM_CHAINS[this.chainId]!;
      return {
        balance: ethers.formatUnits(balance, chainConfig.nativeCurrency.decimals),
        symbol: chainConfig.nativeCurrency.symbol,
        decimals: chainConfig.nativeCurrency.decimals,
      };
    }
    const tokenContract = new ethers.Contract(addr, ERC20_ABI, this.provider);
    const [balance, symbol, decimals] = await Promise.all([
      tokenContract.balanceOf(this.wallet.address),
      tokenContract.symbol(),
      tokenContract.decimals(),
    ]);
    return {
      balance: ethers.formatUnits(balance, decimals),
      symbol,
      decimals: Number(decimals),
    };
  }
}

// ── Factory / Singleton cache ────────────────────────────

const _instances: Map<number, EvmTrading> = new Map();

export function getEvmTrading(chainId: number): EvmTrading {
  let instance = _instances.get(chainId);
  if (!instance) {
    const privateKey = process.env.AT_AGENT_PRIVATE_KEY || process.env.WM_AGENT_PRIVATE_KEY;
    if (!privateKey) {
      throw new Error('AT_AGENT_PRIVATE_KEY not set — cannot create EVM trading instance');
    }
    instance = new EvmTrading(privateKey, chainId);
    _instances.set(chainId, instance);
  }
  return instance;
}

// Clear cached instances (useful for testing)
export function clearEvmTradingCache(): void {
  _instances.clear();
}
