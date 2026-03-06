import { formatUnitsValue } from '@/utils/helpers/number';
import { EvmContract } from '@phoenix-wallet/evm';
import { ethers } from 'ethers';
import { PublicClient } from 'viem';
import { ETH_ADDRESS } from '../constants';
import { ITokenContract, ResponseTransacton } from './TokenContract';

const abi = [
  {
    constant: true,
    inputs: [],
    name: 'name',
    outputs: [
      {
        name: '',
        type: 'string',
      },
    ],
    payable: false,
    stateMutability: 'view',
    type: 'function',
  },
  {
    constant: false,
    inputs: [
      {
        name: '_spender',
        type: 'address',
      },
      {
        name: '_value',
        type: 'uint256',
      },
    ],
    name: 'approve',
    outputs: [
      {
        name: '',
        type: 'bool',
      },
    ],
    payable: false,
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    constant: true,
    inputs: [],
    name: 'totalSupply',
    outputs: [
      {
        name: '',
        type: 'uint256',
      },
    ],
    payable: false,
    stateMutability: 'view',
    type: 'function',
  },
  {
    constant: false,
    inputs: [
      {
        name: '_from',
        type: 'address',
      },
      {
        name: '_to',
        type: 'address',
      },
      {
        name: '_value',
        type: 'uint256',
      },
    ],
    name: 'transferFrom',
    outputs: [
      {
        name: '',
        type: 'bool',
      },
    ],
    payable: false,
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    constant: true,
    inputs: [],
    name: 'decimals',
    outputs: [
      {
        name: '',
        type: 'uint8',
      },
    ],
    payable: false,
    stateMutability: 'view',
    type: 'function',
  },
  {
    constant: true,
    inputs: [
      {
        name: '_owner',
        type: 'address',
      },
    ],
    name: 'balanceOf',
    outputs: [
      {
        name: 'balance',
        type: 'uint256',
      },
    ],
    payable: false,
    stateMutability: 'view',
    type: 'function',
  },
  {
    constant: true,
    inputs: [],
    name: 'symbol',
    outputs: [
      {
        name: '',
        type: 'string',
      },
    ],
    payable: false,
    stateMutability: 'view',
    type: 'function',
  },
  {
    constant: false,
    inputs: [
      {
        name: '_to',
        type: 'address',
      },
      {
        name: '_value',
        type: 'uint256',
      },
    ],
    name: 'transfer',
    outputs: [
      {
        name: '',
        type: 'bool',
      },
    ],
    payable: false,
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    constant: true,
    inputs: [
      {
        name: '_owner',
        type: 'address',
      },
      {
        name: '_spender',
        type: 'address',
      },
    ],
    name: 'allowance',
    outputs: [
      {
        name: '',
        type: 'uint256',
      },
    ],
    payable: false,
    stateMutability: 'view',
    type: 'function',
  },
  {
    payable: true,
    stateMutability: 'payable',
    type: 'fallback',
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        name: 'owner',
        type: 'address',
      },
      {
        indexed: true,
        name: 'spender',
        type: 'address',
      },
      {
        indexed: false,
        name: 'value',
        type: 'uint256',
      },
    ],
    name: 'Approval',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        name: 'from',
        type: 'address',
      },
      {
        indexed: true,
        name: 'to',
        type: 'address',
      },
      {
        indexed: false,
        name: 'value',
        type: 'uint256',
      },
    ],
    name: 'Transfer',
    type: 'event',
  },
];

export class EvmTokenContract extends EvmContract implements ITokenContract {
  constructor(publicClient: PublicClient, tokenAddress: string) {
    super(publicClient, tokenAddress, abi);
  }

  async getAllowance(address: string, spender: string): Promise<string> {
    if (this.address === ETH_ADDRESS) {
      return Number.MAX_VALUE.toString();
    }
    const decimals = await this.getDecimals();
    const allowance = await this.contract.read.allowance([address, spender]);
    return formatUnitsValue(allowance, decimals);
  }

  async getDecimals(): Promise<number> {
    if (this.address === ETH_ADDRESS) {
      return 18;
    }
    const decimals = await this.contract.read.decimals();
    return Number(decimals);
  }
  async getSymbol(): Promise<string> {
    return this.contract.read.symbol();
  }
  async getTotalSupply(): Promise<string> {
    const supply = await this.contract.read.totalSupply();
    return supply.toString();
  }

  async ethBalanceOf(address: string) {
    try {
      const result = await this.publicClient.getBalance({ address: address as `0x${string}` });
      return result;
    } catch (error) {
      throw error;
    }
  }

  async getBalance(address: string): Promise<{ amount: string; uiAmount: string }> {
    const decimals = await this.getDecimals();
    if (this.address === ETH_ADDRESS) {
      const balance = await this.ethBalanceOf(address);
      const amount = balance.toString();
      const uiAmount = formatUnitsValue(amount, decimals);
      return { amount, uiAmount };
    }

    const balance = await this.contract.read.balanceOf([address]);
    const amount = balance.toString();
    const uiAmount = formatUnitsValue(amount, decimals);
    return { amount, uiAmount };
  }

  async approve(spender: string, value: bigint = ethers.MaxUint256): Promise<ResponseTransacton> {
    if (!this.wallet) {
      throw new Error('Wallet not found');
    }
    try {
      const response = await this.contract.write.approve([spender, value], {
        account: this.wallet.address,
      });
      return {
        txHash: response,
        wait: async () => {
          return this.waitTransaction(response);
        },
      };
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  async transfer(to: string, amount: string): Promise<ResponseTransacton> {
    if (!this.wallet) {
      throw new Error('Wallet not found');
    }

    const hash = await this.contract.write.transfer([to, BigInt(amount)], {
      account: this.wallet.address,
    });

    return {
      txHash: hash,
      wait: async () => {
        return this.waitTransaction(hash);
      },
    };
  }
}
