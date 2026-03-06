import { API_ENDPOINT } from '@/configs/endpoint.config';
import { EActionType } from '@/interfaces/global.interface';
import { EOfferStatus } from '@/interfaces/offer.interface';
import { EOrderStatus } from '@/interfaces/order.interface';
import { sleep } from '@/utils/helpers/function';
import { formatUnitsValue, parseValueToBigInt } from '@/utils/helpers/number';
import { EvmContract } from '@phoenix-wallet/evm';
import axios from 'axios';
import _isEmpty from 'lodash/isEmpty';
import { PublicClient } from 'viem';
// import { abiEvmPreMarket } from '../abi/EvmPreMarketABI';
import { ChainId } from '@/constants/contract';
import { AbiCoder, ethers } from 'ethers';
import { abiPreMarket } from '../abi/pre-market/PreMarket';
import { abiPreMarketRef } from '../abi/pre-market/PreMarketAbiRef';
import { WRAP_TOKEN_ABI } from '../abi/wrap-token/WrapTokenAbi';
import { ETH_ADDRESS, TOrderResponse, WRAP_MONAD_TOKEN_ADDRESS } from '../constants';
import { EvmTokenContract } from '../tokens/EvmTokenContract';
import { getValues } from '../utils/helpers';
import { IPreMarketContract, ResponseTransacton } from './PreMarketContract';

export class EvmPreMarketContract extends EvmContract implements IPreMarketContract {
  OFFER_BUY = 1;
  OFFER_SELL = 2;

  private fundDistributorAddress: string;
  private isNetworkWithReferral: boolean;
  private isMonadToken: boolean;

  constructor(
    publicClient: PublicClient,
    address: string,
    fundDistributorAddress: string = ethers.ZeroAddress
  ) {
    const isNetworkWithReferral = [
      ChainId.ARBITRUM_TESTNEST,
      ChainId.BSC_TESTNET,
      ChainId.BASE_SEPOLIA_TESTNET,
      ChainId.SEPOLIA_TESTNET,

      ChainId.BASE_MAINNET,
      ChainId.MANTA_MAINNET,
      ChainId.ARBITRUM_MAINNET,
      ChainId.MERLIN_MAINNET,
      ChainId.BSC_MAINNET,
      ChainId.OPTIMISM_TESTNET,
      ChainId.LINEA_MAINNET,
      ChainId.HYPER_MAINNET,
      ChainId.SONIC_MAINNET,
      ChainId.EVM_MAINNET,
    ].includes(publicClient.chain?.id || 1);

    const isMonadToken = address === '0x12617F31a29DCCff3790E4767239A7b00928d43b';

    super(
      publicClient,
      address,
      isNetworkWithReferral && !isMonadToken ? abiPreMarketRef : abiPreMarket
    );
    this.fundDistributorAddress = fundDistributorAddress;
    this.isNetworkWithReferral = isNetworkWithReferral;
    this.isMonadToken = isMonadToken;
  }

  getContractAddress(): string {
    return this.address;
  }

  getFundDistributorAddress(): string {
    if (this.fundDistributorAddress === ethers.ZeroAddress || !this.fundDistributorAddress) {
      throw new Error('Fund distributor address is not set');
    }
    return this.fundDistributorAddress;
  }

  private async checkAllowanceAndApprove(tokenContract: EvmTokenContract, value: number) {
    if (!this.wallet) {
      throw new Error('Wallet not found');
    }
    const allowance = await tokenContract.getAllowance(this.wallet.address, this.address);

    if (Number(allowance) < Number(value)) {
      if (tokenContract.address === '0xdAC17F958D2ee523a2206206994597C13D831ec7' || tokenContract.address === '0xdac17f958d2ee523a2206206994597c13d831ec7') {
        const approvalZero = await tokenContract.approve(this.address, BigInt(0));
        await approvalZero.wait();
      }
      const response = await tokenContract.approve(this.address);
      await response.wait();
      await sleep(2000);
    }
  }

  //get detail offer
  async getOffer(
    offerIndex: string,
    exTokenAddress: string,
    customIndex: string | null
  ): Promise<{
    totalAmount: number;
    filledAmount: number;
    collateral: { uiAmount: string; amount: string };
    isFullMatch: boolean;
    status: EOfferStatus;
  }> {
    const tokenContract = new EvmTokenContract(this.publicClient, exTokenAddress);
    const decimals = await tokenContract.getDecimals();

    let offer;

    try {
      offer = await this.contract.read.offers([Number(offerIndex)]);
    } catch (error) {
      throw error;
    }

    let status = EOfferStatus.Open;

    if (offer.status === 3 || offer.status === 2) {
      status = EOfferStatus.Closed;
    }

    return {
      totalAmount: Number(formatUnitsValue(offer.amount.toString(), 6)),
      filledAmount: Number(formatUnitsValue(offer.filledAmount.toString(), 6)),
      collateral: {
        amount: offer.collateral.toString(),
        uiAmount: formatUnitsValue(offer.collateral, decimals),
      },
      isFullMatch: offer.fullMatch,
      status,
    };
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
      const tokenContract = new EvmTokenContract(this.publicClient, exTokenAddress);
      tokenContract.wallet = this.wallet;

      const [decimals, balance] = await Promise.all([
        tokenContract.getDecimals(),
        tokenContract.getBalance(this.wallet.address),
      ]);

      const chainId = this.wallet.chain?.id || 1;
      const values = await getValues(amount, priceUsd, exTokenAddress, chainId);

      if (Number(balance.uiAmount) < values.value) {
        throw new Error('Insufficient balance');
      }

      await this.checkAllowanceAndApprove(tokenContract, values.value);

      // Simulate contract call before execution
      if (exTokenAddress === ETH_ADDRESS) {
        const { request } = await this.publicClient.simulateContract({
          account: this.wallet.address as `0x${string}`,
          abi: this.abi,
          address: this.address as `0x${string}`,
          functionName: 'newOfferETH',
          args: [
            type === EActionType.BUY ? this.OFFER_BUY : this.OFFER_SELL,
            tokenId,
            parseValueToBigInt(amount, 6),
            parseValueToBigInt(values.value.toFixed(decimals), decimals),
            isFullMatch,
          ],
          value: parseValueToBigInt(values.value.toFixed(decimals), decimals),
        });

        const txHash = await this.wallet.walletClient.writeContract(request);

        return {
          txHash: txHash,
          wait: async () => {
            await this.waitTransaction(txHash);
          },
        };
      } else {
        const { request } = await this.publicClient.simulateContract({
          account: this.wallet.address as `0x${string}`,
          abi: this.abi,
          address: this.address as `0x${string}`,
          functionName: 'newOffer',
          args: [
            type === EActionType.BUY ? this.OFFER_BUY : this.OFFER_SELL,
            tokenId,
            parseValueToBigInt(amount, 6),
            parseValueToBigInt(values.value.toFixed(decimals), decimals),
            exTokenAddress,
            isFullMatch,
          ],
        });

        const txHash = await this.wallet.walletClient.writeContract(request);

        return {
          txHash: txHash,
          wait: async () => {
            await this.waitTransaction(txHash);
          },
        };
      }
    } catch (error) {
      // if (error instanceof ContractFunctionExecutionError) {
      //   console.log('contract error', error);
      //   throw new Error((error as ContractFunctionExecutionError).shortMessage);
      // }
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
      const tokenContract = new EvmTokenContract(this.publicClient, exTokenAddress);
      tokenContract.wallet = this.wallet;
      const balance = await tokenContract.getBalance(this.wallet.address);

      if (Number(balance.uiAmount) < value) {
        throw new Error('Insufficient balance');
      }

      await this.checkAllowanceAndApprove(tokenContract, value);

      // Simulate contract call before execution
      if (exTokenAddress === ETH_ADDRESS) {
        const { request } = await this.publicClient.simulateContract({
          account: this.wallet.address as `0x${string}`,
          abi: this.abi,
          address: this.address as `0x${string}`,
          functionName: 'fillOfferETH',
          args: [Number(offerIndex), parseValueToBigInt(amount, 6)],
          value: parseValueToBigInt(value.toFixed(18), 18),
        });

        const txHash = await this.wallet.walletClient.writeContract(request);

        return {
          txHash: txHash,
          wait: async () => {
            await this.waitTransaction(txHash);
          },
        };
      } else {
        const { request } = await this.publicClient.simulateContract({
          account: this.wallet.address as `0x${string}`,
          abi: this.abi,
          address: this.address as `0x${string}`,
          functionName: 'fillOffer',
          args: [Number(offerIndex), parseValueToBigInt(amount, 6)],
        });

        const txHash = await this.wallet.walletClient.writeContract(request);

        return {
          txHash: txHash,
          wait: async () => {
            await this.waitTransaction(txHash);
          },
        };
      }
    } catch (error) {
      // if (error instanceof ContractFunctionExecutionError) {
      //   console.log('contract error', error);
      //   throw new Error((error as ContractFunctionExecutionError).shortMessage);
      // }
      throw error;
    }
  }

  //close offer
  async close(offerIndex: string, customIndex: string | null): Promise<ResponseTransacton> {
    try {
      if (!this.wallet) {
        throw new Error('Wallet not found');
      }

      // Simulate contract call before execution
      const emptyData = '0x';
      let requestCheck: any = null;
      if (this.isNetworkWithReferral && !this.isMonadToken) {
        const { request } = await this.publicClient.simulateContract({
          account: this.wallet.address as `0x${string}`,
          abi: this.abi,
          address: this.address as `0x${string}`,
          functionName: 'cancelOffer',
          args: [Number(offerIndex), emptyData, this.getFundDistributorAddress()],
        });
        requestCheck = request;
      } else {
        const { request } = await this.publicClient.simulateContract({
          account: this.wallet.address as `0x${string}`,
          abi: this.abi,
          address: this.address as `0x${string}`,
          functionName: 'cancelOffer',
          args: [Number(offerIndex)],
        });
        requestCheck = request;
      }

      const txHash = await this.wallet.walletClient.writeContract(requestCheck);

      return {
        txHash: txHash,
        wait: async () => {
          return this.waitTransaction(txHash);
        },
      };
    } catch (error) {
      // if (error instanceof ContractFunctionExecutionError) {
      //   console.log('contract error', error);
      //   throw new Error((error as ContractFunctionExecutionError).shortMessage);
      // }
      throw error;
    }
  }

  //get detail order
  async getOrder(orderIndex: string): Promise<TOrderResponse> {
    const ORDER_STATUS = {
      1: EOrderStatus.Open,
      2: EOrderStatus.Settled,
      3: EOrderStatus.Cancel,
    };

    try {
      const result = await this.contract.read.orders([Number(orderIndex)]);

      return {
        amount: Number(formatUnitsValue(result.amount.toString(), 6)),
        status: ORDER_STATUS[result.status as keyof typeof ORDER_STATUS],
        buyer: result.buyer,
        seller: result.seller,
        offerId: result.offerId,
      };
    } catch (error) {
      throw error;
    }
  }

  //settle order
  async settle(
    orderIndex: string,
    tokenAddress: string,
    amount: number,
    customIndex: string | null // using for sui & aptos
  ): Promise<ResponseTransacton> {
    if (!this.wallet) {
      throw new Error('Wallet not found');
    }

    if (_isEmpty(tokenAddress)) {
      throw new Error('Token address is required');
    }

    try {
      const tokenContract = new EvmTokenContract(this.publicClient, tokenAddress);
      tokenContract.wallet = this.wallet;

      const balance = await tokenContract.getBalance(this.wallet.address);

      if (Number(balance.uiAmount) < amount) {
        throw new Error('Insufficient balance');
      }

      await this.checkAllowanceAndApprove(tokenContract, amount);

      const settleArgs = this.isNetworkWithReferral
        ? [Number(orderIndex), '0x', this.getFundDistributorAddress()]
        : [Number(orderIndex)];

      const { request } = await this.publicClient.simulateContract({
        account: this.wallet.address as `0x${string}`,
        abi: this.abi,
        address: this.address as `0x${string}`,
        functionName: 'settleFilled',
        args: settleArgs,
      });

      const txn = await this.wallet.walletClient.writeContract(request);

      return {
        txHash: txn,
        wait: async () => {
          await this.waitTransaction(txn);
        },
      };
    } catch (error) {
      // if (error instanceof ContractFunctionExecutionError) {
      //   console.log('contract error', error);
      //   throw new Error((error as ContractFunctionExecutionError).shortMessage);
      // }
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
    if (!orderUUID) {
      throw new Error('Order UUID is required');
    }

    if (!this.wallet) {
      throw new Error('Wallet not found');
    }

    if (_isEmpty(tokenAddress)) {
      throw new Error('Token address is required');
    }

    try {
      const orderAmount = await this.getOrder(orderIndex);

      // Initialize token contract and check balance
      const tokenContract = new EvmTokenContract(this.publicClient, tokenAddress);
      tokenContract.wallet = this.wallet;

      const balance = await tokenContract.getBalance(this.wallet.address);

      if (Number(balance.uiAmount) < orderAmount.amount) {
        throw new Error('Insufficient balance');
      }

      await this.checkAllowanceAndApprove(tokenContract, orderAmount.amount);

      const apiEndpoint = this.isNetworkWithReferral
        ? `${API_ENDPOINT}/transactions/v2/build-transaction-settle-with-discount-evm`
        : `${API_ENDPOINT}/transactions/build-transaction-settle-with-discount-evm`;

      const apiPayload = this.isNetworkWithReferral
        ? { orderId: orderUUID, sender: this.wallet.address }
        : { orderId: orderUUID };

      const rs = await axios.post(apiEndpoint, apiPayload);
      const data = rs.data.data;

      // Prepare contract call arguments
      let functionName: string;
      let args: any[];

      if (this.isNetworkWithReferral) {
        functionName = 'settleFilled';
        args = [
          Number(orderIndex),
          this.encodeSettleData(
            Number(orderIndex),
            data.sellerDiscount,
            data.buyerDiscount,
            data?.sellerReferrer ?? ethers.ZeroAddress,
            data?.buyerReferrer ?? ethers.ZeroAddress,
            data?.sellerReferralPercent ?? 0,
            data?.buyerReferralPercent ?? 0,
            data?.signature
          ),
          this.getFundDistributorAddress(),
        ];
      } else {
        functionName = 'settleFilledWithDiscount';
        args = [
          Number(orderIndex),
          {
            orderId: Number(orderIndex),
            sellerDiscount: data.sellerDiscount,
            buyerDiscount: data.buyerDiscount,
            signature: data.signature,
          },
        ];
      }

      const { request } = await this.publicClient.simulateContract({
        account: this.wallet.address as `0x${string}`,
        abi: this.abi,
        address: this.address as `0x${string}`,
        functionName,
        args,
      });

      const txn = await this.wallet.walletClient.writeContract(request);
      console.log('txn settleWithDiscount', txn);

      return {
        txHash: txn,
        wait: async () => {
          return this.waitTransaction(txn);
        },
      };
    } catch (error) {
      // if (error instanceof ContractFunctionExecutionError) {
      //   console.log('contract error', error);
      //   throw new Error((error as ContractFunctionExecutionError).shortMessage);
      // }
      throw error;
    }
  }

  //cancel order
  async cancel(orderIndex: string, customIndex: string | null): Promise<ResponseTransacton> {
    if (!this.wallet) {
      throw new Error('Wallet not found');
    }

    try {
      // Prepare settleCancelled arguments
      const cancelArgs = this.isNetworkWithReferral
        ? [Number(orderIndex), '0x', this.getFundDistributorAddress()]
        : [Number(orderIndex)];

      const { request } = await this.publicClient.simulateContract({
        account: this.wallet.address as `0x${string}`,
        abi: this.abi,
        address: this.address as `0x${string}`,
        functionName: 'settleCancelled',
        args: cancelArgs,
      });

      const txn = await this.wallet.walletClient.writeContract(request);

      return {
        txHash: txn,
        wait: async () => {
          return this.waitTransaction(txn);
        },
      };
    } catch (error) {
      // if (error instanceof ContractFunctionExecutionError) {
      //   console.log('contract error', error);
      //   throw new Error((error as ContractFunctionExecutionError).shortMessage);
      // }
      throw error;
    }
  }

  //cancel order with discount
  async cancelWithDiscount(
    orderIndex: string,
    orderUUID: string | null
  ): Promise<ResponseTransacton> {
    if (!orderUUID) {
      throw new Error('Order UUID is required');
    }

    if (!this.wallet) {
      throw new Error('Wallet not found');
    }

    try {
      // Fetch discount data from API
      // Non-Monad uses v2 if referral enabled
      const apiEndpoint =
        this.isNetworkWithReferral && !this.isMonadToken
          ? `${API_ENDPOINT}/transactions/v2/build-transaction-cancel-with-discount-evm`
          : `${API_ENDPOINT}/transactions/build-transaction-cancel-with-discount-evm`;

      const apiPayload =
        this.isNetworkWithReferral && !this.isMonadToken
          ? { orderId: orderUUID, sender: this.wallet.address }
          : { orderId: orderUUID };

      const rs = await axios.post(apiEndpoint, apiPayload);
      const data = rs.data.data;

      // Prepare contract call arguments
      let functionName: string;
      let args: any[];

      if (this.isNetworkWithReferral && !this.isMonadToken) {
        // Network with referral uses settleCancelled with encoded data
        functionName = 'settleCancelled';
        args = [
          Number(orderIndex),
          this.encodeSettleData(
            Number(orderIndex),
            data.sellerDiscount,
            data.buyerDiscount,
            data?.sellerReferrer ?? ethers.ZeroAddress,
            data?.buyerReferrer ?? ethers.ZeroAddress,
            data?.sellerReferralPercent ?? 0,
            data?.buyerReferralPercent ?? 0,
            data?.signature
          ),
          this.getFundDistributorAddress(),
        ];
      } else {
        // Network without referral uses settleCancelledWithDiscount
        functionName = 'settleCancelledWithDiscount';
        args = [
          Number(orderIndex),
          {
            orderId: Number(orderIndex),
            sellerDiscount: data.sellerDiscount,
            buyerDiscount: data.buyerDiscount,
            signature: data.signature,
          },
        ];
      }

      const { request } = await this.publicClient.simulateContract({
        account: this.wallet.address as `0x${string}`,
        abi: this.abi,
        address: this.address as `0x${string}`,
        functionName,
        args,
      });

      const txn = await this.wallet.walletClient.writeContract(request);

      return {
        txHash: txn,
        wait: async () => {
          return this.waitTransaction(txn);
        },
      };
    } catch (error) {
      // if (error instanceof ContractFunctionExecutionError) {
      //   console.log('contract error', error);
      //   throw new Error((error as ContractFunctionExecutionError).shortMessage);
      // }
      throw error;
    }
  }

  async wrapNativeToken(amount: number): Promise<ResponseTransacton> {
    if (!this.wallet) {
      throw new Error('Wallet not found');
    }

    try {
      const monadTokenContract = new EvmTokenContract(this.publicClient, WRAP_MONAD_TOKEN_ADDRESS);
      monadTokenContract.wallet = this.wallet;

      const [decimals] = await Promise.all([monadTokenContract.getDecimals()]);

      const { request: requestDeposit } = await this.publicClient.simulateContract({
        account: this.wallet.address as `0x${string}`,
        abi: WRAP_TOKEN_ABI,
        address: WRAP_MONAD_TOKEN_ADDRESS,
        functionName: 'deposit',
        args: [],
        value: parseValueToBigInt(amount.toFixed(decimals), decimals),
      });

      const txHashDeposit = await this.wallet.walletClient.writeContract(requestDeposit);

      console.log('txHashDeposit', txHashDeposit);

      return {
        txHash: txHashDeposit,
        wait: async () => {
          await this.waitTransaction(txHashDeposit);
        },
      };
    } catch (error) {
      throw error;
    }
  }

  // Helper function to encode (bytes rawData, bytes signature) tuple (for settle functions - uses orderId)
  encodeSettleData(
    orderId: bigint | number,
    sellerDiscount: bigint | number,
    buyerDiscount: bigint | number,
    sellerReferrer: string,
    buyerReferrer: string,
    sellerReferralPercent: bigint | number,
    buyerReferralPercent: bigint | number,
    signature: string
  ): string {
    const abiCoder = AbiCoder.defaultAbiCoder();
    // Encode DiscountData and ReferralData as rawData
    const rawData = abiCoder.encode(
      ['tuple(uint256,uint256,uint256)', 'tuple(uint256,address,address,uint256,uint256)'],
      [
        [orderId, sellerDiscount, buyerDiscount], // DiscountData
        [orderId, sellerReferrer, buyerReferrer, sellerReferralPercent, buyerReferralPercent], // ReferralData
      ]
    );
    // Encode (bytes, bytes) tuple directly
    return abiCoder.encode(['bytes', 'bytes'], [rawData, signature]);
  }
}
