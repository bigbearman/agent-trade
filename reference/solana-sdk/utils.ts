import * as anchor from '@coral-xyz/anchor';
import {
  createAssociatedTokenAccountInstruction,
  createCloseAccountInstruction,
  createSyncNativeInstruction,
  getAccount,
  getAssociatedTokenAddressSync,
  NATIVE_MINT,
  TokenAccountNotFoundError,
  TokenInvalidAccountOwnerError,
} from '@solana/spl-token';
import { Connection, PublicKey } from '@solana/web3.js';

export async function buildInstructionsWrapSol(
  connection: Connection,
  user: PublicKey,
  amount: number
) {
  const instructions: anchor.web3.TransactionInstruction[] = [];
  const associatedTokenAccount = getAssociatedTokenAddressSync(NATIVE_MINT, user);
  try {
    await getAccount(connection, associatedTokenAccount);
  } catch (error: unknown) {
    // TokenAccountNotFoundError can be possible if the associated address has already received some lamports,
    // becoming a system account. Assuming program derived addressing is safe, this is the only case for the
    // TokenInvalidAccountOwnerError in this code path.
    if (
      error instanceof TokenAccountNotFoundError ||
      error instanceof TokenInvalidAccountOwnerError
    ) {
      instructions.push(
        createAssociatedTokenAccountInstruction(user, associatedTokenAccount, user, NATIVE_MINT)
      );
    }
  }
  instructions.push(
    anchor.web3.SystemProgram.transfer({
      fromPubkey: user,
      toPubkey: associatedTokenAccount,
      lamports: amount,
    }),
    createSyncNativeInstruction(associatedTokenAccount)
  );

  return instructions;
}

export async function buildInstructionsUnWrapSol(user: PublicKey) {
  const instructions: anchor.web3.TransactionInstruction[] = [];
  const associatedTokenAccount = getAssociatedTokenAddressSync(NATIVE_MINT, user);
  instructions.push(createCloseAccountInstruction(associatedTokenAccount, user, user));
  return instructions;
}
