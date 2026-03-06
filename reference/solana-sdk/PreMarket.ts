import { API_ENDPOINT } from '@/configs/endpoint.config';
import { EActionType } from '@/interfaces/global.interface';
import * as anchor from '@coral-xyz/anchor';
import { BN, BorshCoder, EventParser, web3 } from '@coral-xyz/anchor';
import {
  NATIVE_MINT,
  createAssociatedTokenAccountInstruction,
  getAccount,
  getAssociatedTokenAddress,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token';
import { Connection, PublicKey, Transaction } from '@solana/web3.js';
import axios from 'axios';
import _chunk from 'lodash/chunk';
import _flatten from 'lodash/flatten';
import {
  getConfigAccountPubKey,
  getExTokenAccountPubKey,
  getOfferAccountPubKey,
  getOrderAccountPubKey,
  getTokenConfigAccountPubKey,
  getVaultTokenAccountPubKey,
} from './accounts';
import { IS_UNITTEST, WEI6 } from './constants';
import { IDL, PreMarketType } from './idl/pre_market';
import { buildInstructionsUnWrapSol, buildInstructionsWrapSol } from './utils';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const randomInt = (min: number, max: number) => {
  min = Math.max(1, min);
  return Math.floor(Math.random() * (max - min + 1) + min);
};
const RANGE_MIN = -20;
const RANGE_MAX = 30;

let id: string;

if (API_ENDPOINT === 'https://api.whales.market') {
  id = '9a161bb2-ffff-4c89-8f20-13360e90bb45';
} else {
  id = 'f13a2ef3-53a4-4c5a-a922-29e08296821b';
}

const GET_MAX_OFFER_URL = API_ENDPOINT + '/transactions/offers/max-index/' + id;
const GET_MAX_ORDER_URL = API_ENDPOINT + '/transactions/orders/max-index/' + id;

export default class PreMarket {
  connection: Connection;
  program: anchor.Program<PreMarketType>;
  // @ts-ignore
  configAccountPubKey: PublicKey;
  // @ts-ignore
  configAccount: anchor.IdlAccounts<PreMarketType>['configAccount'];

  constructor(connection: Connection, programId: string) {
    this.connection = connection;
    this.program = new anchor.Program(IDL, new PublicKey(programId), {
      connection: this.connection,
    });
  }

  async bootstrap(configAccountPubKey: string) {
    this.configAccountPubKey = new PublicKey(configAccountPubKey);
    await this.fetchConfigAccount(configAccountPubKey);
  }

  async fetchConfigAccount(
    configAccountPubKey: string,
    commitment?: anchor.web3.Commitment
  ): Promise<anchor.IdlAccounts<PreMarketType>['configAccount']> {
    this.configAccount = await this.program.account.configAccount.fetch(
      configAccountPubKey,
      commitment
    );
    return this.configAccount;
  }

  async fetchMaxOfferId(): Promise<number> {
    const response = await axios.get(GET_MAX_OFFER_URL);
    return response.data.data.max;
  }

  async fetchMaxOrderId(): Promise<number> {
    const response = await axios.get(GET_MAX_ORDER_URL);
    return response.data.data.max;
  }

  createConfigAccount(signer: PublicKey, feeWallet: PublicKey): Promise<Transaction> {
    if (this.configAccountPubKey) {
      throw new Error('Config account already exists');
    }
    this.configAccountPubKey = getConfigAccountPubKey(this.program, signer);
    return this.program.methods
      .initialize()
      .accounts({
        configAccount: this.configAccountPubKey,
        authority: signer,
        feeWallet: feeWallet,
      })
      .transaction();
  }

  updateConfigAccount(data: {
    feeRefund?: BN;
    feeSettle?: BN;
    nativePledgeRate?: BN;
    feeWallet?: PublicKey;
  }): Promise<Transaction> {
    return this.program.methods
      .updateConfig(data.feeRefund ?? null, data.feeSettle ?? null, data.feeWallet ?? null)
      .accounts({
        configAccount: this.configAccountPubKey,
        authority: this.configAccount.authority,
      })
      .transaction();
  }

  createTokenConfig(
    id: number,
    settleDuration: number,
    pledgeRate: number,
    category: anchor.IdlTypes<PreMarketType>['TokenCategory'],
    signer: PublicKey
  ): Promise<Transaction> {
    const tokenConfigAccountPubKey = getTokenConfigAccountPubKey(
      this.program,
      this.configAccountPubKey,
      id
    );
    return this.program.methods
      .createToken(id, new BN(settleDuration), new BN(pledgeRate), category)
      .accounts({
        configAccount: this.configAccountPubKey,
        tokenConfigAccount: tokenConfigAccountPubKey,
        authority: signer,
      })
      .transaction();
  }

  reallocTokenConfig(id: number, signer: PublicKey): Promise<Transaction> {
    const tokenConfigAccountPubKey = getTokenConfigAccountPubKey(
      this.program,
      this.configAccountPubKey,
      id
    );
    return this.program.methods
      .reallocTokenConfig()
      .accounts({
        configAccount: this.configAccountPubKey,
        tokenConfigAccount: tokenConfigAccountPubKey,
        authority: signer,
      })
      .transaction();
  }

  updateTokenConfig(
    id: number,
    data: {
      status?: anchor.IdlTypes<PreMarketType>['TokenStatus'];
      settleDuration?: BN;
      pledgeRate?: BN;
      settleRate?: BN;
      feeRefund?: BN;
      feeSettle?: BN;
    }
  ): Promise<Transaction> {
    const tokenConfigAccountPubKey = getTokenConfigAccountPubKey(
      this.program,
      this.configAccountPubKey,
      id
    );
    return this.program.methods
      .updateTokenConfig(
        data.status ?? null,
        data.settleDuration ?? null,
        data.pledgeRate ?? null,
        data.settleRate ?? null,
        data.feeRefund ?? null,
        data.feeSettle ?? null
      )
      .accounts({
        tokenConfigAccount: tokenConfigAccountPubKey,
        configAccount: this.configAccountPubKey,
        authority: this.configAccount.authority,
      })
      .transaction();
  }

  async updateTokenAddress(id: number, token: PublicKey): Promise<Transaction> {
    const tokenConfigAccountPubKey = getTokenConfigAccountPubKey(
      this.program,
      this.configAccountPubKey,
      id
    );
    const tokenInfo = await this.program.provider.connection.getParsedAccountInfo(token);

    return this.program.methods
      .updateTokenAddress()
      .accounts({
        tokenConfigAccount: tokenConfigAccountPubKey,
        configAccount: this.configAccountPubKey,
        mint: token,
        authority: this.configAccount.authority,
        // @ts-ignore
        tokenProgram: tokenInfo.value.owner,
      })
      .transaction();
  }

  fetchTokenConfigAccount(
    id: number
  ): Promise<anchor.IdlAccounts<PreMarketType>['tokenConfigAccount']> {
    return this.program.account.tokenConfigAccount.fetch(
      getTokenConfigAccountPubKey(this.program, this.configAccountPubKey, id)
    );
  }

  async setExToken(token: PublicKey, is_accepted: boolean): Promise<Transaction> {
    const exTokenAccountPubKey = getExTokenAccountPubKey(
      this.program,
      this.configAccountPubKey,
      token
    );

    const vaultTokenAccountPubKey = getVaultTokenAccountPubKey(
      this.program,
      this.configAccountPubKey,
      token
    );

    const tokenInfo = await this.program.provider.connection.getParsedAccountInfo(token);

    return this.program.methods
      .setExToken(is_accepted)
      .accounts({
        vaultTokenAccount: vaultTokenAccountPubKey,
        exTokenAccount: exTokenAccountPubKey,
        configAccount: this.configAccountPubKey,
        mint: token,
        authority: this.configAccount.authority,
        // @ts-ignore
        tokenProgram: tokenInfo.value.owner,
      })
      .transaction();
  }

  fetchExTokenAccount(
    token: PublicKey
  ): Promise<anchor.IdlAccounts<PreMarketType>['exTokenAccount']> {
    return this.program.account.exTokenAccount.fetch(
      getExTokenAccountPubKey(this.program, this.configAccountPubKey, token)
    );
  }

  async findIdOffer(): Promise<number> {
    await this.fetchConfigAccount(this.configAccountPubKey.toString(), 'processed');
    const lastOfferId = await this.fetchMaxOfferId();
    let id = IS_UNITTEST
      ? this.configAccount.lastOfferId.toNumber() + 1
      : randomInt(Number(lastOfferId) - RANGE_MIN, Number(lastOfferId) + RANGE_MAX);
    let counter = 0;
    while (true) {
      try {
        await this.fetchOfferAccount(id, 'processed');
      } catch (e) {
        break;
      }
      id = randomInt(Number(lastOfferId) - RANGE_MIN, Number(lastOfferId) + RANGE_MAX);
      counter++;
      if (counter > RANGE_MIN + RANGE_MAX) {
        return 0;
      }
    }
    return id;
  }

  async findIdOrder(): Promise<number> {
    await this.fetchConfigAccount(this.configAccountPubKey.toString(), 'processed');
    const lastOrderId = await this.fetchMaxOrderId();
    let id = IS_UNITTEST
      ? this.configAccount.lastOrderId.toNumber() + 1
      : randomInt(Number(lastOrderId) - RANGE_MIN, Number(lastOrderId) + RANGE_MAX);
    let counter = 0;
    while (true) {
      try {
        await this.fetchOrderAccount(id, 'processed');
      } catch (e) {
        break;
      }
      id = randomInt(Number(lastOrderId) - RANGE_MIN, Number(lastOrderId) + RANGE_MAX);
      counter++;
      if (counter > RANGE_MIN + RANGE_MAX) {
        return 0;
      }
    }
    return id;
  }

  async createOffer(
    tokenId: number,
    type: EActionType,
    exToken: PublicKey,
    amount: number,
    price: number,
    is_fully_match: boolean,
    user: PublicKey
  ): Promise<Transaction> {
    const tokenConfigAccountPubKey = getTokenConfigAccountPubKey(
      this.program,
      this.configAccountPubKey,
      tokenId
    );

    if (exToken.toString() == PublicKey.default.toString()) {
      exToken = NATIVE_MINT;
    }

    const vaultTokenAccountPubKey = getVaultTokenAccountPubKey(
      this.program,
      this.configAccountPubKey,
      exToken
    );

    const exTokenAccountPubKey = getExTokenAccountPubKey(
      this.program,
      this.configAccountPubKey,
      exToken
    );

    const exTokenInfo = await this.program.provider.connection.getParsedAccountInfo(exToken);

    const userTokenAccount = await getAssociatedTokenAddress(
      exToken,
      user,
      false,
      // @ts-ignore
      exTokenInfo.value.owner
    );

    const tokenConfigData = await this.fetchTokenConfigAccount(tokenId);

    const collateral = new anchor.BN(amount)
      .mul(new anchor.BN(price))
      .mul(new anchor.BN(tokenConfigData.pledgeRate))
      .div(new anchor.BN(WEI6))
      .div(new anchor.BN(WEI6))
      .toNumber();

    const value = new anchor.BN(amount)
      .mul(new anchor.BN(price))
      .div(new anchor.BN(WEI6))
      .toNumber();

    const amountTransfer = type == 'buy' ? value : collateral;

    const id = await this.findIdOffer();
    const offerAccountPubKey = getOfferAccountPubKey(this.program, this.configAccountPubKey, id);

    const transaction = await this.program.methods
      .createOffer({ [type]: {} } as any, new BN(amount), new BN(price), is_fully_match, new BN(id))
      .accounts({
        offerAccount: offerAccountPubKey,
        vaultTokenAccount: vaultTokenAccountPubKey,
        configAccount: this.configAccountPubKey,
        tokenConfigAccount: tokenConfigAccountPubKey,
        exTokenAccount: exTokenAccountPubKey,
        userTokenAccount,
        user: user,
        exToken,
        authority: this.configAccount.authority,
        // @ts-ignore
        tokenProgram: exTokenInfo.value.owner,
      })
      .transaction();

    if (exToken.toString() == NATIVE_MINT.toString()) {
      const instructions = await buildInstructionsWrapSol(this.connection, user, amountTransfer);
      const transactionWrapSol = new Transaction().add(...instructions);

      return transactionWrapSol.add(transaction);
    }

    return transaction;
  }

  fetchOfferAccount(
    id: number,
    commitment?: anchor.web3.Commitment
  ): Promise<anchor.IdlAccounts<PreMarketType>['offerAccount']> {
    return this.program.account.offerAccount.fetch(
      getOfferAccountPubKey(this.program, this.configAccountPubKey, id),
      commitment
    );
  }

  async fillOffer(offerId: number, amount: number, user: PublicKey): Promise<Transaction> {
    const offerAccountPubKey = getOfferAccountPubKey(
      this.program,
      this.configAccountPubKey,
      offerId
    );

    const offerAccount = await this.fetchOfferAccount(offerId);

    const tokenConfigAccountPubKey = offerAccount.tokenConfig;

    let exToken = offerAccount.exToken;

    if (exToken.toString() == PublicKey.default.toString()) {
      exToken = NATIVE_MINT;
    }
    const vaultTokenAccountPubKey = getVaultTokenAccountPubKey(
      this.program,
      this.configAccountPubKey,
      exToken
    );
    const exTokenAccountPubKey = getExTokenAccountPubKey(
      this.program,
      this.configAccountPubKey,
      exToken
    );

    const exTokenInfo = await this.program.provider.connection.getParsedAccountInfo(exToken);

    const userTokenAccount = await getAssociatedTokenAddress(
      exToken,
      user,
      false,
      // @ts-ignore
      exTokenInfo.value.owner
    );

    const id = await this.findIdOrder();

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
        user: user,
        exToken,
        authority: this.configAccount.authority,
        // @ts-ignore
        tokenProgram: exTokenInfo.value.owner,
      })
      .transaction();

    if (exToken.toString() == NATIVE_MINT.toString()) {
      let amountTransfer;
      if (Object.keys(offerAccount.offerType)[0] == 'buy') {
        amountTransfer = offerAccount.collateral
          .mul(new anchor.BN(amount))
          .div(offerAccount.totalAmount)
          .toNumber();
      } else {
        amountTransfer = offerAccount.price
          .mul(new anchor.BN(amount))
          .div(new anchor.BN(WEI6))
          .toNumber();
      }

      const instructions = await buildInstructionsWrapSol(this.connection, user, amountTransfer);
      if (instructions.length > 0) {
        const transactionWrapSol = new Transaction().add(...instructions);

        return transactionWrapSol.add(transaction);
      }
    }
    return transaction;
  }

  fetchOrderAccount(
    id: number,
    commitment?: anchor.web3.Commitment
  ): Promise<anchor.IdlAccounts<PreMarketType>['orderAccount']> {
    return this.program.account.orderAccount.fetch(
      getOrderAccountPubKey(this.program, this.configAccountPubKey, id),
      commitment
    );
  }

  async settleOrder(id: number): Promise<Transaction> {
    const orderAccountPubKey = getOrderAccountPubKey(this.program, this.configAccountPubKey, id);
    const orderAccount = await this.fetchOrderAccount(id);

    const offerAccount = await this.program.account.offerAccount.fetch(orderAccount.offer);

    const tokenConfigAccountPubKey = offerAccount.tokenConfig;

    const tokenConfigAccount =
      await this.program.account.tokenConfigAccount.fetch(tokenConfigAccountPubKey);

    const tokenInfo = await this.program.provider.connection.getParsedAccountInfo(
      tokenConfigAccount.token
    );

    const sellerTokenAccount = getAssociatedTokenAddressSync(
      tokenConfigAccount.token,
      orderAccount.seller,
      false,
      // @ts-ignore
      tokenInfo.value.owner
    );

    const buyerTokenAccount = getAssociatedTokenAddressSync(
      tokenConfigAccount.token,
      orderAccount.buyer,
      false,
      // @ts-ignore
      tokenInfo.value.owner
    );

    const vaultExTokenAccountPubKey = getVaultTokenAccountPubKey(
      this.program,
      this.configAccountPubKey,
      offerAccount.exToken
    );

    const exTokenInfo = await this.program.provider.connection.getParsedAccountInfo(
      offerAccount.exToken
    );

    const feeExTokenAccountPubKey = await getAssociatedTokenAddress(
      offerAccount.exToken,
      this.configAccount.feeWallet,
      false,
      // @ts-ignore
      exTokenInfo.value.owner
    );

    const feeTokenAccountPubKey = getAssociatedTokenAddressSync(
      tokenConfigAccount.token,
      this.configAccount.feeWallet,
      false,
      // @ts-ignore
      tokenInfo.value.owner
    );

    const finalTransaction = new Transaction();

    try {
      await getAccount(
        this.connection,
        feeTokenAccountPubKey,
        'confirmed',
        // @ts-ignore
        tokenInfo.value.owner
      );
    } catch (e) {
      finalTransaction.add(
        createAssociatedTokenAccountInstruction(
          orderAccount.seller,
          feeTokenAccountPubKey,
          this.configAccount.feeWallet,
          tokenConfigAccount.token,
          // @ts-ignore
          tokenInfo.value.owner
        )
      );
    }

    try {
      await getAccount(
        this.connection,
        buyerTokenAccount,
        'confirmed',
        // @ts-ignore
        tokenInfo.value.owner
      );
    } catch (e) {
      finalTransaction.add(
        createAssociatedTokenAccountInstruction(
          orderAccount.seller,
          buyerTokenAccount,
          orderAccount.buyer,
          tokenConfigAccount.token,
          // @ts-ignore
          tokenInfo.value.owner
        )
      );
    }

    try {
      await getAccount(
        this.connection,
        sellerTokenAccount,
        'confirmed',
        // @ts-ignore
        tokenInfo.value.owner
      );
    } catch (e) {
      finalTransaction.add(
        createAssociatedTokenAccountInstruction(
          orderAccount.seller,
          sellerTokenAccount,
          orderAccount.seller,
          tokenConfigAccount.token,
          // @ts-ignore
          tokenInfo.value.owner
        )
      );
    }

    const sellerExTokenAccountPubKey = getAssociatedTokenAddressSync(
      offerAccount.exToken,
      orderAccount.seller,
      false,
      // @ts-ignore
      exTokenInfo.value.owner
    );

    try {
      await getAccount(
        this.connection,
        sellerExTokenAccountPubKey,
        'confirmed',
        // @ts-ignore
        exTokenInfo.value.owner
      );
    } catch (e) {
      finalTransaction.add(
        createAssociatedTokenAccountInstruction(
          orderAccount.seller,
          sellerExTokenAccountPubKey,
          orderAccount.seller,
          offerAccount.exToken,
          // @ts-ignore
          exTokenInfo.value.owner
        )
      );
    }

    const exTokenAccountPubKey = getExTokenAccountPubKey(
      this.program,
      this.configAccountPubKey,
      offerAccount.exToken
    );

    const transaction = await this.program.methods
      .settleOrder()
      .accounts({
        orderAccount: orderAccountPubKey,
        offerAccount: orderAccount.offer,
        vaultExTokenAccount: vaultExTokenAccountPubKey,
        configAccount: this.configAccountPubKey,
        tokenConfigAccount: tokenConfigAccountPubKey,
        feeExTokenAccount: feeExTokenAccountPubKey,
        sellerExTokenAccount: sellerExTokenAccountPubKey,
        exTokenAccount: exTokenAccountPubKey,
        exToken: offerAccount.exToken,
        sellerTokenAccount,
        buyerTokenAccount,
        feeTokenAccount: feeTokenAccountPubKey,
        token: tokenConfigAccount.token,
        seller: orderAccount.seller,
        buyer: orderAccount.buyer,
        feeWallet: this.configAccount.feeWallet,
        configAuthority: this.configAccount.authority,
        // @ts-ignore
        tokenProgram: tokenInfo.value.owner,
        // @ts-ignore
        exTokenProgram: exTokenInfo.value.owner,
      })
      .transaction();

    finalTransaction.add(transaction);

    if (offerAccount.exToken.toString() == NATIVE_MINT.toString()) {
      const transactionUnWrapSol = new Transaction().add(
        ...(await buildInstructionsUnWrapSol(orderAccount.seller))
      );

      return finalTransaction.add(transactionUnWrapSol);
    }

    return finalTransaction;
  }

  async cancelUnfilledOrder(id: number): Promise<Transaction> {
    const orderAccountPubKey = getOrderAccountPubKey(this.program, this.configAccountPubKey, id);

    const orderAccount = await this.fetchOrderAccount(id);

    const offerAccount = await this.program.account.offerAccount.fetch(orderAccount.offer);

    const tokenConfigAccountPubKey = offerAccount.tokenConfig;

    const exTokenAccountPubKey = getExTokenAccountPubKey(
      this.program,
      this.configAccountPubKey,
      offerAccount.exToken
    );

    const vaultExTokenAccountPubKey = getVaultTokenAccountPubKey(
      this.program,
      this.configAccountPubKey,
      offerAccount.exToken
    );

    const exTokenInfo = await this.program.provider.connection.getParsedAccountInfo(
      offerAccount.exToken
    );

    const feeExTokenAccountPubKey = await getAssociatedTokenAddress(
      offerAccount.exToken,
      this.configAccount.feeWallet,
      false,
      // @ts-ignore
      exTokenInfo.value.owner
    );

    const buyerExTokenAccountPubKey = await getAssociatedTokenAddress(
      offerAccount.exToken,
      orderAccount.buyer,
      false,
      // @ts-ignore
      exTokenInfo.value.owner
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
        exToken: offerAccount.exToken,
        buyer: orderAccount.buyer,
        feeWallet: this.configAccount.feeWallet,
        configAuthority: this.configAccount.authority,
        // @ts-ignore
        tokenProgram: exTokenInfo.value.owner,
      })
      .transaction();

    if (offerAccount.exToken.toString() == NATIVE_MINT.toString()) {
      const transactionUnWrapSol = new Transaction().add(
        ...(await buildInstructionsUnWrapSol(orderAccount.buyer))
      );

      return transaction.add(transactionUnWrapSol);
    }

    return transaction;
  }

  async cancelOrder(id: number): Promise<Transaction> {
    const orderAccountPubKey = getOrderAccountPubKey(this.program, this.configAccountPubKey, id);

    const orderAccount = await this.fetchOrderAccount(id);

    const offerAccount = await this.program.account.offerAccount.fetch(orderAccount.offer);

    const tokenConfigAccountPubKey = offerAccount.tokenConfig;

    const exTokenAccountPubKey = getExTokenAccountPubKey(
      this.program,
      this.configAccountPubKey,
      offerAccount.exToken
    );

    const vaultExTokenAccountPubKey = getVaultTokenAccountPubKey(
      this.program,
      this.configAccountPubKey,
      offerAccount.exToken
    );

    const exTokenInfo = await this.program.provider.connection.getParsedAccountInfo(
      offerAccount.exToken
    );

    const buyerExTokenAccountPubKey = getAssociatedTokenAddressSync(
      offerAccount.exToken,
      orderAccount.buyer,
      false,
      // @ts-ignore
      exTokenInfo.value.owner
    );

    const sellerExTokenAccountPubKey = getAssociatedTokenAddressSync(
      offerAccount.exToken,
      orderAccount.seller,
      false,
      // @ts-ignore
      exTokenInfo.value.owner
    );

    const transaction = await this.program.methods
      .cancelOrder()
      .accounts({
        orderAccount: orderAccountPubKey,
        offerAccount: orderAccount.offer,
        configAccount: this.configAccountPubKey,
        tokenConfigAccount: tokenConfigAccountPubKey,
        vaultExTokenAccount: vaultExTokenAccountPubKey,
        buyerExTokenAccount: buyerExTokenAccountPubKey,
        sellerExTokenAccount: sellerExTokenAccountPubKey,
        exTokenAccount: exTokenAccountPubKey,
        exToken: offerAccount.exToken,
        seller: orderAccount.seller,
        buyer: orderAccount.buyer,
        offerAuthority: offerAccount.authority,
        configAuthority: this.configAccount.authority,
        // @ts-ignore
        tokenProgram: exTokenInfo.value.owner,
      })
      .transaction();

    // if (offerAccount.exToken.toString() == NATIVE_MINT.toString()) {
    //   const transactionUnWrapSol = new Transaction().add(
    //     ...(await buildInstructionsUnWrapSol(orderAccount.authority))
    //   );
    //
    //   return transaction.add(transactionUnWrapSol);
    // }

    return transaction;
  }

  async closeUnFullFilledOffer(id: number): Promise<Transaction> {
    const offerAccountPubKey = getOfferAccountPubKey(this.program, this.configAccountPubKey, id);

    const offerAccount = await this.fetchOfferAccount(id);
    const user = offerAccount.authority;

    const exToken = offerAccount.exToken;

    const vaultExTokenAccountPubKey = getVaultTokenAccountPubKey(
      this.program,
      this.configAccountPubKey,
      exToken
    );

    const exTokenInfo = await this.program.provider.connection.getParsedAccountInfo(exToken);

    const feeExTokenAccountPubKey = await getAssociatedTokenAddress(
      exToken,
      this.configAccount.feeWallet,
      false,
      // @ts-ignore
      exTokenInfo.value.owner
    );

    const finalTransaction = new Transaction();

    const userExTokenAccountPubKey = getAssociatedTokenAddressSync(
      exToken,
      user,
      false,
      // @ts-ignore
      exTokenInfo.value.owner
    );

    if (offerAccount.exToken.toString() == NATIVE_MINT.toString()) {
      try {
        await getAccount(
          this.connection,
          userExTokenAccountPubKey,
          'confirmed',
          // @ts-ignore
          exTokenInfo.value.owner
        );
      } catch (e) {
        finalTransaction.add(
          createAssociatedTokenAccountInstruction(
            user,
            userExTokenAccountPubKey,
            user,
            exToken,
            // @ts-ignore
            exTokenInfo.value.owner
          )
        );
      }
    }

    const exTokenAccountPubKey = getExTokenAccountPubKey(
      this.program,
      this.configAccountPubKey,
      exToken
    );

    const transaction = await this.program.methods
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
        user: user,
        feeWallet: this.configAccount.feeWallet,
        configAuthority: this.configAccount.authority,
        // @ts-ignore
        tokenProgram: exTokenInfo.value.owner,
      })
      .transaction();

    finalTransaction.add(transaction);

    if (offerAccount.exToken.toString() == NATIVE_MINT.toString()) {
      const transactionUnWrapSol = new Transaction().add(
        ...(await buildInstructionsUnWrapSol(user))
      );

      return finalTransaction.add(transactionUnWrapSol);
    }

    return finalTransaction;
  }

  private async getProgramSignatures(untilSignature?: string): Promise<string[]> {
    const until = untilSignature ? untilSignature : null;
    const confirmedSignatureInfo = await this.connection.getConfirmedSignaturesForAddress2(
      this.program.programId,
      // @ts-ignore
      { until: until },
      'finalized'
    );
    return confirmedSignatureInfo.filter(item => item.err == null).map(item => item.signature);
  }

  private async splitTransactions(signatures: string[]): Promise<Array<string[]>> {
    let batchSignatures: Array<string[]>;
    if (signatures.length < 10) {
      batchSignatures = [signatures];
    } else {
      batchSignatures = _chunk(signatures, 10);
    }

    return batchSignatures;
  }

  public async parseTransactions(signatures: string[]): Promise<web3.ParsedTransactionWithMeta[]> {
    const transactions: web3.ParsedTransactionWithMeta[] = [];
    while (true) {
      try {
        const batchTransactions = await this.connection.getParsedTransactions(
          signatures,
          'finalized'
        );
        // @ts-ignore
        transactions.push(...batchTransactions);
        break;
      } catch (e) {
        console.error(e);
        await sleep(1000);
      }
    }

    return _flatten(transactions);
  }

  async getTransactions(untilSignature?: string): Promise<{
    data: Array<string[]>;
    latestSignature?: string;
  }> {
    const signatures = await this.getProgramSignatures(untilSignature);
    console.log(`Found ${signatures.length} signatures`);
    return {
      data: signatures.length ? await this.splitTransactions(signatures) : [],
      latestSignature: signatures.length ? signatures[0] : untilSignature,
    };
  }

  parseEvent(transactionParsed: web3.ParsedTransactionWithMeta) {
    const eventParser = new EventParser(this.program.programId, new BorshCoder(this.program.idl));
    // @ts-ignore
    const events = eventParser.parseLogs(transactionParsed.meta.logMessages);
    const eventsData: any[] = [];
    // @ts-ignore
    for (const event of events) {
      eventsData.push(event);
    }
    return eventsData.map(event => {
      return {
        ...event,
        tx_hash: transactionParsed.transaction.signatures[0],
      };
    });
  }

  parseEvents(transactionsParsed: web3.ParsedTransactionWithMeta[]) {
    const events = transactionsParsed.map(transactionParsed => {
      return this.parseEvent(transactionParsed);
    });
    return _flatten(events);
  }
}
