import { IPriceExToken } from '@/interfaces/token.interface';
import Service from '@/service/app.service';
import { div, mul } from '@/utils';

export const getValues = async (
  amount: number,
  priceUsd: number,
  exTokenAddress: string,
  chainId: number
): Promise<{ value: number; price: number }> => {
  const response = await Service.network.getTokenPrice(chainId);
  const listPrice: IPriceExToken[] = response?.data || [];
  const priceExToken = listPrice.find(item => item.address === exTokenAddress)?.price || 1;
  const price = div(priceUsd, priceExToken);
  const value = mul(amount, price);
  return { value, price };
};
