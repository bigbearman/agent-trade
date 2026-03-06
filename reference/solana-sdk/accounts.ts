import * as anchor from '@coral-xyz/anchor';
import { Program } from '@coral-xyz/anchor';
import { PublicKey } from '@solana/web3.js';
import { PreMarketType } from './idl/pre_market';

const getSeed = (seed: string, program: Program<PreMarketType>): Buffer => {
  return Buffer.from(
    // @ts-ignore
    JSON.parse(program.idl.constants.find(c => c.name === seed)!.value)
  );
};

const toBuffer = (value: anchor.BN, endian?: any, length?: any) => {
  try {
    return value.toBuffer(endian, length);
  } catch (error) {
    return value.toArrayLike(Buffer, endian, length);
  }
};

export const getConfigAccountPubKey = (
  program: Program<PreMarketType>,
  configAuthority: PublicKey
) => {
  return anchor.web3.PublicKey.findProgramAddressSync(
    [getSeed('CONFIG_PDA_SEED', program), configAuthority.toBuffer()],
    program.programId
  )[0];
};

export const getTokenConfigAccountPubKey = (
  program: Program<PreMarketType>,
  configAccount: PublicKey,
  id: number
) => {
  return anchor.web3.PublicKey.findProgramAddressSync(
    [
      getSeed('TOKEN_PDA_SEED', program),
      configAccount.toBuffer(),
      toBuffer(new anchor.BN(id), 'be', 2),
    ],
    program.programId
  )[0];
};

export const getExTokenAccountPubKey = (
  program: Program<PreMarketType>,
  configAccount: PublicKey,
  tokenMint: PublicKey
) => {
  return anchor.web3.PublicKey.findProgramAddressSync(
    [getSeed('EX_TOKEN_PDA_SEED', program), configAccount.toBuffer(), tokenMint.toBuffer()],
    program.programId
  )[0];
};

export const getVaultTokenAccountPubKey = (
  program: Program<PreMarketType>,
  configAccount: PublicKey,
  tokenMint: PublicKey
) => {
  return anchor.web3.PublicKey.findProgramAddressSync(
    [getSeed('VAULT_TOKEN_PDA_SEED', program), configAccount.toBuffer(), tokenMint.toBuffer()],
    program.programId
  )[0];
};

export const getOfferAccountPubKey = (
  program: Program<PreMarketType>,
  configAccount: PublicKey,
  offerId: number
) => {
  return anchor.web3.PublicKey.findProgramAddressSync(
    [
      getSeed('OFFER_PDA_SEED', program),
      configAccount.toBuffer(),
      toBuffer(new anchor.BN(offerId), 'be', 8),
    ],
    program.programId
  )[0];
};

export const getOrderAccountPubKey = (
  program: Program<PreMarketType>,
  configAccount: PublicKey,
  orderId: number
) => {
  return anchor.web3.PublicKey.findProgramAddressSync(
    [
      getSeed('ORDER_PDA_SEED', program),
      configAccount.toBuffer(),
      toBuffer(new anchor.BN(orderId), 'be', 8),
    ],
    program.programId
  )[0];
};

export const getRoleAccountPubKey = (
  program: Program<PreMarketType>,
  configAccount: PublicKey,
  user: PublicKey
) => {
  return anchor.web3.PublicKey.findProgramAddressSync(
    [getSeed('ROLE_PDA_SEED', program), configAccount.toBuffer(), user.toBuffer()],
    program.programId
  )[0];
};
