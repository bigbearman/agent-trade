// PDA derivation helpers for the Solana Pre-Market program

import anchor from '@coral-xyz/anchor';
const { Program: _Program } = anchor;
type Program<T extends anchor.Idl> = anchor.Program<T>;
import { PublicKey } from '@solana/web3.js';
import type { PreMarketType } from './idl/pre_market.js';

const getSeed = (seed: string, program: Program<PreMarketType>): Buffer => {
  return Buffer.from(
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    JSON.parse(program.idl.constants.find(c => c.name === seed)!.value)
  );
};

const toBuffer = (value: anchor.BN, endian?: 'be' | 'le', length?: number) => {
  try {
    return value.toBuffer(endian, length);
  } catch {
    return value.toArrayLike(Buffer, endian, length);
  }
};

export const getConfigAccountPubKey = (
  program: Program<PreMarketType>,
  configAuthority: PublicKey,
): PublicKey => {
  return anchor.web3.PublicKey.findProgramAddressSync(
    [getSeed('CONFIG_PDA_SEED', program), configAuthority.toBuffer()],
    program.programId,
  )[0];
};

export const getTokenConfigAccountPubKey = (
  program: Program<PreMarketType>,
  configAccount: PublicKey,
  id: number,
): PublicKey => {
  return anchor.web3.PublicKey.findProgramAddressSync(
    [
      getSeed('TOKEN_PDA_SEED', program),
      configAccount.toBuffer(),
      toBuffer(new anchor.BN(id), 'be', 2),
    ],
    program.programId,
  )[0];
};

export const getExTokenAccountPubKey = (
  program: Program<PreMarketType>,
  configAccount: PublicKey,
  tokenMint: PublicKey,
): PublicKey => {
  return anchor.web3.PublicKey.findProgramAddressSync(
    [getSeed('EX_TOKEN_PDA_SEED', program), configAccount.toBuffer(), tokenMint.toBuffer()],
    program.programId,
  )[0];
};

export const getVaultTokenAccountPubKey = (
  program: Program<PreMarketType>,
  configAccount: PublicKey,
  tokenMint: PublicKey,
): PublicKey => {
  return anchor.web3.PublicKey.findProgramAddressSync(
    [getSeed('VAULT_TOKEN_PDA_SEED', program), configAccount.toBuffer(), tokenMint.toBuffer()],
    program.programId,
  )[0];
};

export const getOfferAccountPubKey = (
  program: Program<PreMarketType>,
  configAccount: PublicKey,
  offerId: number,
): PublicKey => {
  return anchor.web3.PublicKey.findProgramAddressSync(
    [
      getSeed('OFFER_PDA_SEED', program),
      configAccount.toBuffer(),
      toBuffer(new anchor.BN(offerId), 'be', 8),
    ],
    program.programId,
  )[0];
};

export const getOrderAccountPubKey = (
  program: Program<PreMarketType>,
  configAccount: PublicKey,
  orderId: number,
): PublicKey => {
  return anchor.web3.PublicKey.findProgramAddressSync(
    [
      getSeed('ORDER_PDA_SEED', program),
      configAccount.toBuffer(),
      toBuffer(new anchor.BN(orderId), 'be', 8),
    ],
    program.programId,
  )[0];
};
