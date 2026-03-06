// Server-side Solana Pre-Market trading — ported from frontend SDK
// Uses Keypair signing instead of browser wallet adapters

import anchor from '@coral-xyz/anchor';
const { BN } = anchor;
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionMessage,
  VersionedTransaction,
  ComputeBudgetProgram,
  type TransactionInstruction,
} from '@solana/web3.js';
import {
  NATIVE_MINT,
  createAssociatedTokenAccountInstruction,
  createCloseAccountInstruction,
  createSyncNativeInstruction,
  getAccount,
  getAssociatedTokenAddress,
  getAssociatedTokenAddressSync,
  TokenAccountNotFoundError,
  TokenInvalidAccountOwnerError,
} from '@solana/spl-token';
import bs58 from 'bs58';
import axios from 'axios';

import { IDL, type PreMarketType } from './idl/pre_market.js';
import {
  getTokenConfigAccountPubKey,
  getExTokenAccountPubKey,
  getVaultTokenAccountPubKey,
  getOfferAccountPubKey,
  getOrderAccountPubKey,
} from './accounts.js';
import {
  WEI6,
  DEFAULT_COMPUTE_UNIT_PRICE,
  COMPUTE_UNIT_BUFFER,
  getNetworkConfig,
} from './constants.js';

// ── Types ────────────────────────────────────────────────

export interface SolanaTradeResult {
  success: boolean;
  txHash?: string;
  error?: string;
  simulation?: {
    success: boolean;
    unitsConsumed?: number;
    logs?: string[];
    error?: string;
  };
}

export interface OnChainOffer {
  authority: string;
  tokenConfig: string;
  exToken: string;
  offerType: string;
  totalAmount: string;
  filledAmount: string;
  collateral: string;
  price: string;
  status: string;
  isFullMatch: boolean;
}

export interface OnChainOrder {
  offer: string;
  buyer: string;
  seller: string;
  amount: string;
  status: string;
}

// ── Wrap/Unwrap SOL helpers ──────────────────────────────

async function buildInstructionsWrapSol(
  connection: Connection,
  user: PublicKey,
  amount: number,
): Promise<TransactionInstruction[]> {
  const instructions: TransactionInstruction[] = [];
  const associatedTokenAccount = getAssociatedTokenAddressSync(NATIVE_MINT, user);
  try {
    await getAccount(connection, associatedTokenAccount);
  } catch (error: unknown) {
    if (
      error instanceof TokenAccountNotFoundError ||
      error instanceof TokenInvalidAccountOwnerError
    ) {
      instructions.push(
        createAssociatedTokenAccountInstruction(user, associatedTokenAccount, user, NATIVE_MINT),
      );
    }
  }
  instructions.push(
    anchor.web3.SystemProgram.transfer({
      fromPubkey: user,
      toPubkey: associatedTokenAccount,
      lamports: amount,
    }),
    createSyncNativeInstruction(associatedTokenAccount),
  );
  return instructions;
}

async function buildInstructionsUnWrapSol(user: PublicKey): Promise<TransactionInstruction[]> {
  const associatedTokenAccount = getAssociatedTokenAddressSync(NATIVE_MINT, user);
  return [createCloseAccountInstruction(associatedTokenAccount, user, user)];
}

// ── Random ID helpers ────────────────────────────────────

const randomInt = (min: number, max: number): number => {
  min = Math.max(1, min);
  return Math.floor(Math.random() * (max - min + 1) + min);
};

const RANGE_MIN = -20;
const RANGE_MAX = 30;

// ── Main Trading Class ───────────────────────────────────

export class SolanaTrading {
  private connection: Connection;
  private program: anchor.Program<PreMarketType>;
  private configAccountPubKey: PublicKey;
  private configAccount!: anchor.IdlAccounts<PreMarketType>['configAccount'];
  private apiUrl: string;
  private networkConfig: ReturnType<typeof getNetworkConfig>;

  constructor() {
    this.networkConfig = getNetworkConfig();
    this.connection = new Connection(this.networkConfig.rpcUrl, 'confirmed');
    this.program = new anchor.Program(IDL, new PublicKey(this.networkConfig.programId), {
      connection: this.connection,
    });
    this.configAccountPubKey = new PublicKey(this.networkConfig.configAccount);
    this.apiUrl = process.env.WM_API_URL || 'https://api.whales.market';
  }

  // ── Bootstrap ──────────────────────────────────────────

  async bootstrap(): Promise<void> {
    this.configAccount = await this.program.account.configAccount.fetch(
      this.configAccountPubKey,
      'confirmed',
    );
  }

  private async ensureBootstrapped(): Promise<void> {
    if (!this.configAccount) {
      await this.bootstrap();
    }
  }

  // ── Keypair from env ───────────────────────────────────

  private getKeypair(): Keypair {
    const privateKey = process.env.WM_AGENT_PRIVATE_KEY;
    if (!privateKey) {
      throw new Error('WM_AGENT_PRIVATE_KEY not set — cannot sign transactions');
    }
    return Keypair.fromSecretKey(bs58.decode(privateKey));
  }

  // ── Find available offer/order ID ──────────────────────

  private async fetchMaxOfferId(): Promise<number> {
    const networkConfig = getNetworkConfig();
    const apiUrl = process.env.WM_API_URL || 'https://api.whales.market';
    let id: string;
    if (apiUrl === 'https://api.whales.market') {
      id = '9a161bb2-ffff-4c89-8f20-13360e90bb45';
    } else {
      id = 'f13a2ef3-53a4-4c5a-a922-29e08296821b';
    }
    const response = await axios.get(`${apiUrl}/transactions/offers/max-index/${id}`);
    return response.data.data.max;
  }

  private async fetchMaxOrderId(): Promise<number> {
    const apiUrl = process.env.WM_API_URL || 'https://api.whales.market';
    let id: string;
    if (apiUrl === 'https://api.whales.market') {
      id = '9a161bb2-ffff-4c89-8f20-13360e90bb45';
    } else {
      id = 'f13a2ef3-53a4-4c5a-a922-29e08296821b';
    }
    const response = await axios.get(`${apiUrl}/transactions/orders/max-index/${id}`);
    return response.data.data.max;
  }

  private async findIdOffer(): Promise<number> {
    await this.ensureBootstrapped();
    // Refresh config to get latest lastOfferId
    this.configAccount = await this.program.account.configAccount.fetch(
      this.configAccountPubKey,
      'processed',
    );
    const lastOfferId = await this.fetchMaxOfferId();
    let id = randomInt(Number(lastOfferId) + RANGE_MIN, Number(lastOfferId) + RANGE_MAX);
    let counter = 0;
    while (true) {
      try {
        await this.program.account.offerAccount.fetch(
          getOfferAccountPubKey(this.program, this.configAccountPubKey, id),
          'processed',
        );
      } catch {
        break;
      }
      id = randomInt(Number(lastOfferId) + RANGE_MIN, Number(lastOfferId) + RANGE_MAX);
      counter++;
      if (counter > Math.abs(RANGE_MIN) + RANGE_MAX) {
        return 0;
      }
    }
    return id;
  }

  private async findIdOrder(): Promise<number> {
    await this.ensureBootstrapped();
    this.configAccount = await this.program.account.configAccount.fetch(
      this.configAccountPubKey,
      'processed',
    );
    const lastOrderId = await this.fetchMaxOrderId();
    let id = randomInt(Number(lastOrderId) + RANGE_MIN, Number(lastOrderId) + RANGE_MAX);
    let counter = 0;
    while (true) {
      try {
        await this.program.account.orderAccount.fetch(
          getOrderAccountPubKey(this.program, this.configAccountPubKey, id),
          'processed',
        );
      } catch {
        break;
      }
      id = randomInt(Number(lastOrderId) + RANGE_MIN, Number(lastOrderId) + RANGE_MAX);
      counter++;
      if (counter > Math.abs(RANGE_MIN) + RANGE_MAX) {
        return 0;
      }
    }
    return id;
  }

  // ── Build transaction with compute budget ──────────────

  private async buildVersionedTransaction(
    txn: Transaction,
    payerKey: PublicKey,
  ): Promise<{ transaction: VersionedTransaction; blockhash: string; lastValidBlockHeight: number }> {
    const { blockhash, lastValidBlockHeight } =
      await this.connection.getLatestBlockhash('confirmed');

    const instructions = txn.instructions;

    // Simulate to get compute unit consumption
    const simMessage = new TransactionMessage({
      payerKey,
      recentBlockhash: blockhash,
      instructions: [
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1_400_000 }),
        ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 }),
        ...instructions,
      ],
    }).compileToV0Message();

    const simResult = await this.connection.simulateTransaction(
      new VersionedTransaction(simMessage),
      { sigVerify: false, commitment: 'confirmed' },
    );

    if (simResult.value.err) {
      const errData = { logs: simResult.value.logs, err: simResult.value.err };
      throw new Error(`Transaction simulation failed: ${JSON.stringify(errData, null, 2)}`);
    }

    const computeUnitLimit = Math.ceil(
      (simResult.value.unitsConsumed || 200_000) * COMPUTE_UNIT_BUFFER,
    );

    // Build final versioned transaction
    const messageV0 = new TransactionMessage({
      payerKey,
      recentBlockhash: blockhash,
      instructions: [
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: DEFAULT_COMPUTE_UNIT_PRICE }),
        ComputeBudgetProgram.setComputeUnitLimit({ units: computeUnitLimit }),
        ...instructions,
      ],
    }).compileToV0Message();

    return {
      transaction: new VersionedTransaction(messageV0),
      blockhash,
      lastValidBlockHeight,
    };
  }

  // ── Sign & send transaction ────────────────────────────

  private async signAndSend(
    txn: Transaction,
    keypair: Keypair,
    dryRun: boolean = false,
  ): Promise<SolanaTradeResult> {
    const { transaction, blockhash, lastValidBlockHeight } =
      await this.buildVersionedTransaction(txn, keypair.publicKey);

    if (dryRun) {
      return {
        success: true,
        simulation: {
          success: true,
          logs: ['Simulation passed — dry run, transaction not sent'],
        },
      };
    }

    // Sign with keypair
    transaction.sign([keypair]);

    // Send
    const txHash = await this.connection.sendRawTransaction(transaction.serialize(), {
      skipPreflight: false,
      maxRetries: 5,
    });

    // Confirm
    await this.connection.confirmTransaction(
      { signature: txHash, blockhash, lastValidBlockHeight },
      'confirmed',
    );

    return { success: true, txHash };
  }

  // ── Create Offer ───────────────────────────────────────

  async createOffer(
    tokenId: number,
    type: 'buy' | 'sell',
    exToken: PublicKey,
    amount: number,
    price: number,
    isFullMatch: boolean,
    dryRun: boolean = false,
  ): Promise<SolanaTradeResult> {
    await this.ensureBootstrapped();
    const keypair = this.getKeypair();
    const user = keypair.publicKey;

    const tokenConfigAccountPubKey = getTokenConfigAccountPubKey(
      this.program,
      this.configAccountPubKey,
      tokenId,
    );

    let mintKey = exToken;
    if (mintKey.toString() === PublicKey.default.toString()) {
      mintKey = NATIVE_MINT;
    }

    const vaultTokenAccountPubKey = getVaultTokenAccountPubKey(
      this.program,
      this.configAccountPubKey,
      mintKey,
    );
    const exTokenAccountPubKey = getExTokenAccountPubKey(
      this.program,
      this.configAccountPubKey,
      mintKey,
    );

    const exTokenInfo = await this.connection.getParsedAccountInfo(mintKey);
    // @ts-ignore — exTokenInfo.value.owner is the token program
    const tokenProgram = exTokenInfo.value.owner;

    const userTokenAccount = await getAssociatedTokenAddress(
      mintKey,
      user,
      false,
      tokenProgram,
    );

    // Calculate collateral for determining wrap amount
    const tokenConfigData = await this.program.account.tokenConfigAccount.fetch(
      tokenConfigAccountPubKey,
    );

    const collateral = new BN(amount)
      .mul(new BN(price))
      .mul(new BN(tokenConfigData.pledgeRate.toString()))
      .div(new BN(WEI6))
      .div(new BN(WEI6))
      .toNumber();

    const value = new BN(amount).mul(new BN(price)).div(new BN(WEI6)).toNumber();
    const amountTransfer = type === 'buy' ? value : collateral;

    const id = await this.findIdOffer();
    if (id === 0) throw new Error('Could not find available offer ID slot');

    const offerAccountPubKey = getOfferAccountPubKey(this.program, this.configAccountPubKey, id);

    const transaction = await this.program.methods
      .createOffer(
        { [type]: {} } as any,
        new BN(amount),
        new BN(price),
        isFullMatch,
        new BN(id),
      )
      .accounts({
        offerAccount: offerAccountPubKey,
        vaultTokenAccount: vaultTokenAccountPubKey,
        configAccount: this.configAccountPubKey,
        tokenConfigAccount: tokenConfigAccountPubKey,
        exTokenAccount: exTokenAccountPubKey,
        userTokenAccount,
        user,
        exToken: mintKey,
        authority: this.configAccount.authority,
        tokenProgram,
      })
      .transaction();

    // Wrap SOL if using native mint
    if (mintKey.toString() === NATIVE_MINT.toString()) {
      const wrapIxs = await buildInstructionsWrapSol(this.connection, user, amountTransfer);
      const wrapTx = new Transaction().add(...wrapIxs);
      const fullTx = wrapTx.add(transaction);
      return this.signAndSend(fullTx, keypair, dryRun);
    }

    return this.signAndSend(transaction, keypair, dryRun);
  }

  // ── Fill Offer ─────────────────────────────────────────

  async fillOffer(
    offerId: number,
    amount: number,
    dryRun: boolean = false,
  ): Promise<SolanaTradeResult> {
    await this.ensureBootstrapped();
    const keypair = this.getKeypair();
    const user = keypair.publicKey;

    const offerAccountPubKey = getOfferAccountPubKey(
      this.program,
      this.configAccountPubKey,
      offerId,
    );
    const offerAccount = await this.program.account.offerAccount.fetch(offerAccountPubKey);

    const tokenConfigAccountPubKey = offerAccount.tokenConfig;

    let exToken = offerAccount.exToken;
    if (exToken.toString() === PublicKey.default.toString()) {
      exToken = NATIVE_MINT;
    }

    const vaultTokenAccountPubKey = getVaultTokenAccountPubKey(
      this.program,
      this.configAccountPubKey,
      exToken,
    );
    const exTokenAccountPubKey = getExTokenAccountPubKey(
      this.program,
      this.configAccountPubKey,
      exToken,
    );

    const exTokenInfo = await this.connection.getParsedAccountInfo(exToken);
    // @ts-ignore
    const tokenProgram = exTokenInfo.value.owner;

    const userTokenAccount = await getAssociatedTokenAddress(exToken, user, false, tokenProgram);

    const id = await this.findIdOrder();
    if (id === 0) throw new Error('Could not find available order ID slot');

    const orderAccountPubKey = getOrderAccountPubKey(this.program, this.configAccountPubKey, id);

    const transaction = await this.program.methods
      .fillOffer(new BN(amount), new BN(id))
      .accounts({
        orderAccount: orderAccountPubKey,
        offerAccount: offerAccountPubKey,
        vaultTokenAccount: vaultTokenAccountPubKey,
        exTokenAccount: exTokenAccountPubKey,
        configAccount: this.configAccountPubKey,
        tokenConfigAccount: tokenConfigAccountPubKey,
        userTokenAccount,
        user,
        exToken,
        authority: this.configAccount.authority,
        tokenProgram,
      })
      .transaction();

    // Wrap SOL if needed
    if (exToken.toString() === NATIVE_MINT.toString()) {
      let amountTransfer: number;
      const offerType = Object.keys(offerAccount.offerType)[0];
      if (offerType === 'buy') {
        amountTransfer = offerAccount.collateral
          .mul(new BN(amount))
          .div(offerAccount.totalAmount)
          .toNumber();
      } else {
        amountTransfer = offerAccount.price
          .mul(new BN(amount))
          .div(new BN(WEI6))
          .toNumber();
      }

      const wrapIxs = await buildInstructionsWrapSol(this.connection, user, amountTransfer);
      if (wrapIxs.length > 0) {
        const fullTx = new Transaction().add(...wrapIxs).add(transaction);
        return this.signAndSend(fullTx, keypair, dryRun);
      }
    }

    return this.signAndSend(transaction, keypair, dryRun);
  }

  // ── Close Unfilled Offer ───────────────────────────────

  async closeOffer(
    offerId: number,
    dryRun: boolean = false,
  ): Promise<SolanaTradeResult> {
    await this.ensureBootstrapped();
    const keypair = this.getKeypair();
    const user = keypair.publicKey;

    const offerAccountPubKey = getOfferAccountPubKey(
      this.program,
      this.configAccountPubKey,
      offerId,
    );
    const offerAccount = await this.program.account.offerAccount.fetch(offerAccountPubKey);

    const exToken = offerAccount.exToken;

    const vaultExTokenAccountPubKey = getVaultTokenAccountPubKey(
      this.program,
      this.configAccountPubKey,
      exToken,
    );

    const exTokenInfo = await this.connection.getParsedAccountInfo(exToken);
    // @ts-ignore
    const tokenProgram = exTokenInfo.value.owner;

    const feeExTokenAccountPubKey = await getAssociatedTokenAddress(
      exToken,
      this.configAccount.feeWallet,
      false,
      tokenProgram,
    );

    const finalTransaction = new Transaction();

    const userExTokenAccountPubKey = getAssociatedTokenAddressSync(
      exToken,
      user,
      false,
      tokenProgram,
    );

    // Ensure ATA exists for native mint
    if (exToken.toString() === NATIVE_MINT.toString()) {
      try {
        await getAccount(this.connection, userExTokenAccountPubKey, 'confirmed', tokenProgram);
      } catch {
        finalTransaction.add(
          createAssociatedTokenAccountInstruction(
            user,
            userExTokenAccountPubKey,
            user,
            exToken,
            tokenProgram,
          ),
        );
      }
    }

    const exTokenAccountPubKey = getExTokenAccountPubKey(
      this.program,
      this.configAccountPubKey,
      exToken,
    );

    const closeIx = await this.program.methods
      .closeUnFullFilledOffer()
      .accounts({
        offerAccount: offerAccountPubKey,
        vaultExTokenAccount: vaultExTokenAccountPubKey,
        tokenConfigAccount: offerAccount.tokenConfig,
        configAccount: this.configAccountPubKey,
        feeExTokenAccount: feeExTokenAccountPubKey,
        userExTokenAccount: userExTokenAccountPubKey,
        exTokenAccount: exTokenAccountPubKey,
        exToken,
        user,
        feeWallet: this.configAccount.feeWallet,
        configAuthority: this.configAccount.authority,
        tokenProgram,
      })
      .transaction();

    finalTransaction.add(closeIx);

    // Unwrap SOL if native mint
    if (exToken.toString() === NATIVE_MINT.toString()) {
      const unwrapIxs = await buildInstructionsUnWrapSol(user);
      finalTransaction.add(...unwrapIxs);
    }

    return this.signAndSend(finalTransaction, keypair, dryRun);
  }

  // ── Cancel Unfilled Order ──────────────────────────────

  async cancelOrder(
    orderId: number,
    dryRun: boolean = false,
  ): Promise<SolanaTradeResult> {
    await this.ensureBootstrapped();
    const keypair = this.getKeypair();

    const orderAccountPubKey = getOrderAccountPubKey(
      this.program,
      this.configAccountPubKey,
      orderId,
    );
    const orderAccount = await this.program.account.orderAccount.fetch(orderAccountPubKey);
    const offerAccount = await this.program.account.offerAccount.fetch(orderAccount.offer);

    const tokenConfigAccountPubKey = offerAccount.tokenConfig;
    const exToken = offerAccount.exToken;

    const exTokenAccountPubKey = getExTokenAccountPubKey(
      this.program,
      this.configAccountPubKey,
      exToken,
    );
    const vaultExTokenAccountPubKey = getVaultTokenAccountPubKey(
      this.program,
      this.configAccountPubKey,
      exToken,
    );

    const exTokenInfo = await this.connection.getParsedAccountInfo(exToken);
    // @ts-ignore
    const tokenProgram = exTokenInfo.value.owner;

    const feeExTokenAccountPubKey = await getAssociatedTokenAddress(
      exToken,
      this.configAccount.feeWallet,
      false,
      tokenProgram,
    );
    const buyerExTokenAccountPubKey = await getAssociatedTokenAddress(
      exToken,
      orderAccount.buyer,
      false,
      tokenProgram,
    );

    const transaction = await this.program.methods
      .cancelUnFilledOrder()
      .accounts({
        orderAccount: orderAccountPubKey,
        offerAccount: orderAccount.offer,
        configAccount: this.configAccountPubKey,
        tokenConfigAccount: tokenConfigAccountPubKey,
        vaultExTokenAccount: vaultExTokenAccountPubKey,
        feeExTokenAccount: feeExTokenAccountPubKey,
        buyerExTokenAccount: buyerExTokenAccountPubKey,
        exTokenAccount: exTokenAccountPubKey,
        exToken,
        buyer: orderAccount.buyer,
        feeWallet: this.configAccount.feeWallet,
        configAuthority: this.configAccount.authority,
        tokenProgram,
      })
      .transaction();

    // Unwrap SOL if native mint
    if (exToken.toString() === NATIVE_MINT.toString()) {
      const unwrapIxs = await buildInstructionsUnWrapSol(orderAccount.buyer);
      transaction.add(...unwrapIxs);
    }

    return this.signAndSend(transaction, keypair, dryRun);
  }

  // ── Read on-chain data ─────────────────────────────────

  async getOnChainOffer(offerId: number): Promise<OnChainOffer> {
    await this.ensureBootstrapped();
    const offerAccountPubKey = getOfferAccountPubKey(
      this.program,
      this.configAccountPubKey,
      offerId,
    );
    const data = await this.program.account.offerAccount.fetch(offerAccountPubKey, 'confirmed');

    return {
      authority: data.authority.toString(),
      tokenConfig: data.tokenConfig.toString(),
      exToken: data.exToken.toString(),
      offerType: Object.keys(data.offerType)[0],
      totalAmount: data.totalAmount.toString(),
      filledAmount: data.filledAmount.toString(),
      collateral: data.collateral.toString(),
      price: data.price.toString(),
      status: Object.keys(data.status)[0],
      isFullMatch: data.isFullMatch,
    };
  }

  async getOnChainOrder(orderId: number): Promise<OnChainOrder> {
    await this.ensureBootstrapped();
    const orderAccountPubKey = getOrderAccountPubKey(
      this.program,
      this.configAccountPubKey,
      orderId,
    );
    const data = await this.program.account.orderAccount.fetch(orderAccountPubKey, 'confirmed');

    return {
      offer: data.offer.toString(),
      buyer: data.buyer.toString(),
      seller: data.seller.toString(),
      amount: data.amount.toString(),
      status: Object.keys(data.status)[0],
    };
  }

  // ── Get network info ───────────────────────────────────

  getNetworkInfo(): { programId: string; configAccount: string; rpcUrl: string; isDevnet: boolean } {
    return this.networkConfig;
  }
}

// ── Singleton instance ───────────────────────────────────

let _instance: SolanaTrading | null = null;

export function getSolanaTrading(): SolanaTrading {
  if (!_instance) {
    _instance = new SolanaTrading();
  }
  return _instance;
}
