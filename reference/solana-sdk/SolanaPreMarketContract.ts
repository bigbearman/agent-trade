import { API_ENDPOINT } from '@/configs/endpoint.config';
import { isDev } from '@/configs/mode.config';
import { ChainId } from '@/constants/contract';
import { EActionType } from '@/interfaces/global.interface';
import { EOfferStatus } from '@/interfaces/offer.interface';
import { formatUnitsValue, parseValueToBigInt } from '@/utils/helpers/number';
import * as anchor from '@coral-xyz/anchor';
import { SolanaContract } from '@phoenix-wallet/solana';
import {
  Commitment,
  ComputeBudgetProgram,
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js';
import axios from 'axios';
import _isEmpty from 'lodash/isEmpty';
import { TOrderResponse } from '../constants';
import PreMarket from '../sdk/solana/pre-market/PreMarket';
import { SolanaTokenContract } from '../tokens/SolanaTokenContract';
import { getValues } from '../utils/helpers';
import { IPreMarketContract, ResponseTransacton } from './PreMarketContract';
import { bs58 } from '@coral-xyz/anchor/dist/cjs/utils/bytes';

export class SolanaPreMarketContract
  extends SolanaContract<PreMarket>
  implements IPreMarketContract {
  constructor(connection: Connection, contractAddress: string, configAccountPubKey: string) {
    const preMarket = new PreMarket(connection, contractAddress);
    preMarket
      .bootstrap(configAccountPubKey)
      .then()
      .catch(error => {
        console.error('bootstrap error', error);
      });
    super(connection, contractAddress, preMarket);
  }

  getContractAddress(): string {
    return this.address;
  }

  //get detail offer
  async getOffer(
    offerIndex: string,
    exTokenAddress: string
  ): Promise<{
    totalAmount: number;
    filledAmount: number;
    collateral: { uiAmount: string; amount: string };
    isFullMatch: boolean;
    status: EOfferStatus;
  }> {
    try {
      const tokenContract = new SolanaTokenContract(this.connection, exTokenAddress);
      const [decimals, result] = await Promise.all([
        tokenContract.getDecimals(),
        this.sdk.fetchOfferAccount(Number(offerIndex), 'confirmed'),
      ]);

      const statusOncChain = Object.keys(result?.status)[0] as EOfferStatus;
      // const price = Number(formatUnitsValue(result.price.toString(), decimals));
      const totalAmount = Number(formatUnitsValue(result.totalAmount.toString(), 6));
      const filledAmount = Number(formatUnitsValue(result.filledAmount.toString(), 6));

      return {
        totalAmount: totalAmount,
        filledAmount: filledAmount,
        collateral: {
          uiAmount: formatUnitsValue(result.collateral.toString(), decimals),
          amount: result.collateral.toString(),
        },
        isFullMatch: result.isFullMatch,
        status: statusOncChain,
      };
    } catch (error) {
      console.log('error in get offer solana', error);
      throw error;
    }
  }

  //create offer
  async create(
    tokenId: string,
    amount: number,
    priceUsd: number,
    exTokenAddress: string,
    isFullMatch: boolean,
    type: EActionType,
    customIndex: string | null
  ): Promise<ResponseTransacton> {
    try {
      if (!this.wallet) {
        throw new Error('Wallet not found');
      }
      const tokenContract = new SolanaTokenContract(this.connection, exTokenAddress);

      const [decimals, balance] = await Promise.all([
        tokenContract.getDecimals(),
        tokenContract.getBalance(this.wallet.address),
      ]);
      const chainId = isDev ? ChainId.SOLANA_DEVNET : ChainId.SOLANA_MAINNET;

      const values = await getValues(amount, priceUsd, exTokenAddress, chainId);

      if (Number(balance.uiAmount) < values.value) {
        throw new Error('Insufficient balance');
      }

      const txn = await this.sdk.createOffer(
        Number(tokenId),
        type,
        new PublicKey(exTokenAddress),
        Number(parseValueToBigInt(amount, 6)),
        Number(parseValueToBigInt(values.price.toFixed(decimals), decimals)),
        isFullMatch,
        new PublicKey(this.wallet?.address)
      );

      const transaction = await this.addBlockhashAndComputeUnit(txn);

      const txHash = await this.signAndSendTransaction(transaction.transaction);
      return {
        txHash: txHash,
        wait: () => {
          return this.waitTransaction(
            txHash,
            transaction.blockhash,
            transaction.lastValidBlockHeight
          );
        },
      };
    } catch (error) {
      if ((error as Error).message.includes('Simulation failed')) {
        console.log('contract error', error);
        const anchorError = anchor.AnchorError.parse((error as any).logs);
        if (anchorError?.error) {
          throw new Error(
            `Contract execution failed: ${anchorError?.error?.errorMessage} (code: ${anchorError?.error.errorCode.code} ${anchorError?.error.errorCode.number})`
          );
        }
      }
      throw error;
    }
  }

  //fill offer
  async fill(
    offerIndex: string,
    amount: number,
    exTokenAddress: string,
    value: number,
    customIndex: string | null
  ): Promise<ResponseTransacton> {
    try {
      if (!this.wallet) {
        throw new Error('Wallet not found');
      }
      const tokenContract = new SolanaTokenContract(this.connection, exTokenAddress);
      const balance = await tokenContract.getBalance(this.wallet.address);

      if (Number(balance.uiAmount) < value) {
        throw new Error('Insufficient balance');
      }

      const txn = await this.sdk.fillOffer(
        Number(offerIndex),
        Number(parseValueToBigInt(amount, 6)),
        new PublicKey(this.wallet?.address)
      );

      const transaction = await this.addBlockhashAndComputeUnit(txn);

      const txHash = await this.signAndSendTransaction(transaction.transaction);
      return {
        txHash: txHash,
        wait: () => {
          return this.waitTransaction(
            txHash,
            transaction.blockhash,
            transaction.lastValidBlockHeight
          );
        },
      };
    } catch (error) {
      if ((error as Error).message.includes('Simulation failed')) {
        console.log('contract error', error);
        const anchorError = anchor.AnchorError.parse((error as any).logs);
        if (anchorError?.error) {
          throw new Error(
            `Contract execution failed: ${anchorError?.error?.errorMessage} (code: ${anchorError?.error.errorCode.code} ${anchorError?.error.errorCode.number})`
          );
        }
      }
      throw error;
    }
  }

  //close offer
  async close(offerIndex: string, customIndex: string | null): Promise<ResponseTransacton> {
    try {
      const txn = await this.sdk.closeUnFullFilledOffer(Number(offerIndex));
      const transaction = await this.addBlockhashAndComputeUnit(txn);
      const txHash = await this.signAndSendTransaction(transaction.transaction);
      return {
        txHash: txHash,
        wait: () => {
          return this.waitTransaction(
            txHash,
            transaction.blockhash,
            transaction.lastValidBlockHeight
          );
        },
      };
    } catch (error) {
      if ((error as Error).message.includes('Simulation failed')) {
        console.log('contract error', error);
        const anchorError = anchor.AnchorError.parse((error as any).logs);
        if (anchorError?.error) {
          throw new Error(
            `Contract execution failed: ${anchorError?.error?.errorMessage} (code: ${anchorError?.error.errorCode.code} ${anchorError?.error.errorCode.number})`
          );
        }
      }
      throw error;
    }
  }

  //get detail order
  async getOrder(orderIndex: string): Promise<TOrderResponse> {
    throw new Error('Method not implemented.');
  }

  // settle order
  async settle(
    orderIndex: string,
    tokenAddress: string,
    amount: number,
    customIndex: string | null // using for sui & aptos
  ): Promise<ResponseTransacton> {
    try {
      if (!this.wallet) {
        throw new Error('Wallet not found');
      }

      if (_isEmpty(tokenAddress)) {
        throw new Error('Token address is required');
      }

      if (Number(amount) <= 0) {
        throw new Error('Amount is required');
      }

      const tokenContract = new SolanaTokenContract(this.connection, tokenAddress);
      const balance = await tokenContract.getBalance(this.wallet.address);

      if (Number(balance.uiAmount) < amount) {
        throw new Error('Insufficient balance');
      }

      const txn = await this.sdk.settleOrder(Number(orderIndex));
      const transaction = await this.addBlockhashAndComputeUnit(txn);
      const txHash = await this.signAndSendTransaction(transaction.transaction);

      return {
        txHash: txHash,
        wait: () => {
          return this.waitTransaction(
            txHash,
            transaction.blockhash,
            transaction.lastValidBlockHeight
          );
        },
      };
    } catch (error) {
      if ((error as Error).message.includes('Simulation failed')) {
        console.log('contract error', error);
        const anchorError = anchor.AnchorError.parse((error as any).logs);
        if (anchorError?.error) {
          throw new Error(
            `Contract execution failed: ${anchorError?.error?.errorMessage} (code: ${anchorError?.error.errorCode.code} ${anchorError?.error.errorCode.number})`
          );
        }
      }
      throw error;
    }
  }

  //settle order with discount
  async settleWithDiscount(
    orderIndex: string,
    tokenAddress: string,
    amount: number,
    orderUUID: string | null,
    customIndex: string | null
  ): Promise<ResponseTransacton> {
    try {
      if (!this.wallet) {
        throw new Error('Wallet not found');
      }

      if (_isEmpty(tokenAddress)) {
        throw new Error('Token address is required');
      }

      const tokenContract = new SolanaTokenContract(this.connection, tokenAddress);
      const balance = await tokenContract.getBalance(this.wallet.address);

      if (Number(balance.uiAmount) < amount) {
        throw new Error('Insufficient balance');
      }

      //TODO : BE will return blockhash and lastValidBlockHeight
      const response = await axios.post(
        `${API_ENDPOINT}/transactions/build-transaction-settle-with-discount`,
        {
          orderId: Number(orderIndex),
          feePayer: this.wallet.address,
        }
      );
      const { blockhash, lastValidBlockHeight } =
        await this.connection.getLatestBlockhash('finalized');
      const txn = Transaction.from(Buffer.from(response.data.data, 'base64'));

      const txHash = await this.signAndSendTransaction(txn);
      return {
        txHash: txHash,
        wait: () => {
          return this.waitTransaction(txHash, blockhash, lastValidBlockHeight);
        },
      };
    } catch (error) {
      if ((error as Error).message.includes('Simulation failed')) {
        console.log('contract error', error);
        const anchorError = anchor.AnchorError.parse((error as any).logs);
        if (anchorError?.error) {
          throw new Error(
            `Contract execution failed: ${anchorError?.error?.errorMessage} (code: ${anchorError?.error.errorCode.code} ${anchorError?.error.errorCode.number})`
          );
        }
      }
      throw error;
    }
  }

  //cancel order
  async cancel(orderIndex: string, customIndex: string | null): Promise<ResponseTransacton> {
    if (!this.wallet) {
      throw new Error('Wallet not found');
    }
    try {
      const txn = await this.sdk.cancelUnfilledOrder(Number(orderIndex));
      const transaction = await this.addBlockhashAndComputeUnit(txn);
      const txHash = await this.signAndSendTransaction(transaction.transaction);
      return {
        txHash: txHash,
        wait: () => {
          return this.waitTransaction(
            txHash,
            transaction.blockhash,
            transaction.lastValidBlockHeight
          );
        },
      };
    } catch (error) {
      if ((error as Error).message.includes('Simulation failed')) {
        console.log('contract error', error);
        const anchorError = anchor.AnchorError.parse((error as any).logs);
        if (anchorError?.error) {
          throw new Error(
            `Contract execution failed: ${anchorError?.error?.errorMessage} (code: ${anchorError?.error.errorCode.code} ${anchorError?.error.errorCode.number})`
          );
        }
      }
      throw error;
    }
  }

  async cancelWithDiscount(
    orderIndex: string,
    orderUUID: string | null
  ): Promise<ResponseTransacton> {
    try {
      if (!this.wallet) {
        throw new Error('Wallet not found');
      }

      //TODO : BE will return blockhash and lastValidBlockHeight
      const response = await axios.post(
        `${API_ENDPOINT}/transactions/build-transaction-cancel-with-discount`,
        {
          orderId: Number(orderIndex),
          feePayer: this.wallet.address,
        }
      );

      const { blockhash, lastValidBlockHeight } =
        await this.connection.getLatestBlockhash('finalized');
      const txn = Transaction.from(Buffer.from(response.data.data, 'base64'));
      const txHash = await this.signAndSendTransaction(txn);
      return {
        txHash: txHash,
        wait: () => {
          return this.waitTransaction(txHash, blockhash, lastValidBlockHeight);
        },
      };
    } catch (error) {
      if ((error as Error).message.includes('Simulation failed')) {
        console.log('contract error', error);
        const anchorError = anchor.AnchorError.parse((error as any).logs);
        if (anchorError?.error) {
          throw new Error(
            `Contract execution failed: ${anchorError?.error?.errorMessage} (code: ${anchorError?.error.errorCode.code} ${anchorError?.error.errorCode.number})`
          );
        }
      }
      throw error;
    }
  }

  //sign and send transaction
  private async signAndSendTransaction(
    transaction: VersionedTransaction | Transaction,
    maxRetries: number = 10
  ): Promise<string> {
    if (!this.wallet) {
      throw new Error('Wallet not found');
    }

    // Sign the transaction
    const signedTransaction = await this.wallet.signTransaction(transaction);

    // Extract the signature based on the return type
    let txSignature: string;

    if (typeof signedTransaction === 'string') {
      // If it's a string, decode it to get the transaction and extract signature
      const buffer = Buffer.from(signedTransaction, 'base64');
      const tx = VersionedTransaction.deserialize(buffer);
      txSignature = bs58.encode(tx.signatures[0]);
    } else {
      // If it's an object with signature property
      txSignature = signedTransaction.signature;
    }

    // Retry sending the transaction
    // First attempt: await the result
    try {
      await this.wallet.sendRawTransaction(signedTransaction);
    } catch (error) {
      console.log(`Transaction send attempt 1/${maxRetries} failed:`, error);
    }

    // Subsequent attempts: fire in background without blocking
    (async () => {
      for (let attempt = 1; attempt < maxRetries; attempt++) {
        await new Promise(resolve => setTimeout(resolve, 1500));
        try {
          await this.wallet!.sendRawTransaction(signedTransaction);
          console.log(`Transaction send attempt ${attempt + 1}/${maxRetries} succeeded`);
          break; // Stop retrying if successful
        } catch (error) {
          console.log(`Transaction send attempt ${attempt + 1}/${maxRetries} failed:`, error);
        }
      }
    })();

    return txSignature;
  }

  private async preSimulateTransaction(
    payerKey: PublicKey,
    recentBlockhash: string,
    instructions: TransactionInstruction[],
    commitment: Commitment = 'confirmed'
  ): Promise<number> {
    // build transaction message
    const messageV0 = new TransactionMessage({
      payerKey: payerKey,
      recentBlockhash: recentBlockhash,
      instructions: [
        ComputeBudgetProgram.setComputeUnitPrice({
          microLamports: 1_400_000,
        }),
        ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 }),
        ...instructions,
      ],
    }).compileToV0Message();

    const simulateTx = await this.connection.simulateTransaction(new VersionedTransaction(messageV0), {
      sigVerify: false,
      commitment,
    });
    console.log('pre-simulate transaction', JSON.stringify(simulateTx, null, 2));

    if (simulateTx.value.err) {
      const errData = { logs: simulateTx.value.logs, err: simulateTx.value.err };
      throw new Error(`Transaction pre-simulation failed: ${JSON.stringify(errData, null, 2)}`);
    }

    // return compute unit consumed or default maximum CU limit
    return simulateTx.value.unitsConsumed || 1_400_000;
  }

  //add blockhash and compute unit
  private async addBlockhashAndComputeUnit(
    txn: Transaction | VersionedTransaction,
    computeUnitPrice: number = 200_000
  ): Promise<{
    transaction: VersionedTransaction;
    blockhash: string;
    lastValidBlockHeight: number;
  }> {
    if (!this.wallet) {
      throw new Error('Wallet not found');
    }

    const { blockhash, lastValidBlockHeight } =
      await this.connection.getLatestBlockhash('confirmed');

    let instructions: TransactionInstruction[];
    if (txn instanceof VersionedTransaction) {
      instructions = txn.message.compiledInstructions.map(instruction => {
        return {
          programId: new PublicKey(txn.message.staticAccountKeys[instruction.programIdIndex]),
          keys: instruction.accountKeyIndexes.map((index: number) => ({
            pubkey: new PublicKey(txn.message.staticAccountKeys[index]),
            isSigner: txn.message.isAccountSigner(index),
            isWritable: txn.message.isAccountWritable(index),
          })),
          data: Buffer.from(instruction.data),
        };
      });
    } else {
      instructions = txn.instructions;
    }

    // simulate transaction to get compute unit limit
    const simulatedComputeUnits = await this.preSimulateTransaction(
      new PublicKey(this.wallet.address),
      blockhash,
      instructions,
      'confirmed'
    );

    // Add 25% buffer to compute unit limit
    const computeUnitLimit = Math.ceil(simulatedComputeUnits * 1.25);

    const messageV0 = new TransactionMessage({
      payerKey: new PublicKey(this.wallet.address),
      recentBlockhash: blockhash,
      instructions: [
        ComputeBudgetProgram.setComputeUnitPrice({
          microLamports: computeUnitPrice,
        }),
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
}
