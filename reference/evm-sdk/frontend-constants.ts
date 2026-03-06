import { isPrd } from '@/configs/mode.config';
import { EOrderStatus } from '@/interfaces/order.interface';

export const ETH_ADDRESS = '0x0000000000000000000000000000000000000000';

export type TOrderResponse = {
  amount: number;
  status: EOrderStatus;
  buyer: string;
  seller: string;
  offerId: number;
};

export const WRAP_MONAD_TOKEN_ADDRESS = isPrd
  ? '0xe43BF3aF12dDE5C13184Bd1DFC954224C4805A4f'
  : '0x58A3462D7F6cfcD2E3B85Ac4e86d0362db0aB2CD';
