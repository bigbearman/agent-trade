#!/usr/bin/env node

import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Auto-read version from package.json
const __dirname = fileURLToPath(new URL('.', import.meta.url));
const PKG_VERSION = (() => {
  try {
    const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf-8'));
    return pkg.version || '0.0.0';
  } catch {
    return '0.0.0';
  }
})();
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { Keypair } from '@solana/web3.js';
import { Wallet } from 'ethers';
import bs58 from 'bs58';
import { WhalesMarketAPI } from './api-client.js';
import { WalletManager } from './wallet.js';
import { buildOrderBook, executeTradeIntent, reactToOffer, cancelOffer, cancelOrder, resolveTokenChainInfo } from './trading.js';
import { EVM_CHAINS, isSolanaChain, isEvmChain } from './evm-constants.js';

// ── Config ────────────────────────────────────────────────

const API_URL = process.env.WM_API_URL || 'https://api.whales.market';
const AUTH_TOKEN = process.env.WM_AUTH_TOKEN;

const api = new WhalesMarketAPI(API_URL, AUTH_TOKEN);
const wallet = new WalletManager();

// ── Helper ────────────────────────────────────────────────

function formatResult(data: unknown): { type: 'text'; text: string }[] {
  return [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }];
}

function handleError(error: unknown): { content: { type: 'text'; text: string }[]; isError: true } {
  const message = error instanceof Error ? error.message : String(error);
  return { content: [{ type: 'text' as const, text: `Error: ${message}` }], isError: true };
}

// ── Create Server ─────────────────────────────────────────

function createServer(): McpServer {
  const server = new McpServer({
    name: 'whales-market-mcp',
    version: PKG_VERSION,
  });

  // ── Tool 1: search_tokens ─────────────────────────────────

  server.tool(
    'search_tokens',
    'Search and list tokens on Whales Market. Filter by category (pre_market, otc_market, point_market, vesting_market), search by name/symbol, sort by volume or price.',
    {
      search: z.string().optional().describe('Search by token name or symbol'),
      category: z.enum(['pre_market', 'otc_market', 'point_market', 'vesting_market', 'whitelist_market', 'rune_market']).optional().describe('Token category'),
      status: z.string().optional().describe('Token status filter'),
      chain_id: z.number().optional().describe('Blockchain chain ID'),
      sortField: z.string().optional().describe('Field to sort by'),
      sortType: z.enum(['ASC', 'DESC']).optional().describe('Sort direction'),
      page: z.number().optional().describe('Page number (default: 1)'),
      take: z.number().optional().describe('Items per page (default: 20, max: 50)'),
    },
    async (params) => {
      try {
        const result = await api.getTokens(params);
        return { content: formatResult(result) };
      } catch (error) {
        return handleError(error);
      }
    },
  );

  // ── Tool 2: get_token_detail ──────────────────────────────

  server.tool(
    'get_token_detail',
    'Get detailed information about a specific token on Whales Market, including price, volume, settlement time, and market data.',
    {
      symbol: z.string().describe('Token symbol (e.g., "HYPE", "GRASS", "EIGEN")'),
    },
    async ({ symbol }) => {
      try {
        const result = await api.getTokenDetail(symbol);
        return { content: formatResult(result) };
      } catch (error) {
        return handleError(error);
      }
    },
  );

  // ── Tool 3: get_token_chart ───────────────────────────────

  server.tool(
    'get_token_chart',
    'Get historical price chart data for a token. Useful for analyzing price trends and movements.',
    {
      token_id: z.string().describe('Token ID'),
      resolution: z.string().optional().describe('Chart resolution (e.g., "1", "5", "15", "60", "D")'),
      from: z.number().optional().describe('Start timestamp (unix seconds)'),
      to: z.number().optional().describe('End timestamp (unix seconds)'),
    },
    async (params) => {
      try {
        const result = await api.getTokenChartData(params);
        return { content: formatResult(result) };
      } catch (error) {
        return handleError(error);
      }
    },
  );

  // ── Tool 4: get_offers ────────────────────────────────────

  server.tool(
    'get_offers',
    'Get buy/sell offers for tokens on Whales Market. Filter by symbol, offer type (buy/sell), category, and status.',
    {
      symbol: z.string().describe('Token symbol (required, e.g., "HYPE", "PENGU")'),
      offer_type: z.enum(['buy', 'sell']).optional().describe('Offer type: buy or sell'),
      category: z.enum(['pre_market', 'otc_market', 'point_market', 'vesting_market']).optional().describe('Market category'),
      status: z.string().optional().describe('Offer status (open, closed, filled, etc.)'),
      chain_id: z.number().optional().describe('Blockchain chain ID'),
      page: z.number().optional().describe('Page number'),
      take: z.number().optional().describe('Items per page (default: 20)'),
    },
    async (params) => {
      try {
        const result = await api.getOffers(params);
        return { content: formatResult(result) };
      } catch (error) {
        return handleError(error);
      }
    },
  );

  // ── Tool 5: get_recent_trades ─────────────────────────────

  server.tool(
    'get_recent_trades',
    'Get the most recent trades across all markets on Whales Market.',
    {
      page: z.number().optional().describe('Page number'),
      take: z.number().optional().describe('Items per page (default: 20)'),
    },
    async (params) => {
      try {
        const result = await api.getRecentTrades(params);
        return { content: formatResult(result) };
      } catch (error) {
        return handleError(error);
      }
    },
  );

  // ── Tool 6: get_market_stats ──────────────────────────────

  server.tool(
    'get_market_stats',
    'Get overall market statistics and overview for Whales Market, including total volume, number of trades, and active markets.',
    {},
    async () => {
      try {
        const [overview, volume] = await Promise.all([
          api.getMarketStats(),
          api.getStatisticVolume(),
        ]);
        return { content: formatResult({ overview, volume }) };
      } catch (error) {
        return handleError(error);
      }
    },
  );

  // ── Tool 7: get_wallet_info ──────────────────────────────

  server.tool(
    'get_wallet_info',
    'Get wallet information and user details for a specific address on Whales Market, including tier, discount, and statistics.',
    {
      address: z.string().describe('Wallet address'),
    },
    async ({ address }) => {
      try {
        const [walletInfo, stats, discount] = await Promise.all([
          api.getWalletInfo(address),
          api.getUserStats(address),
          api.getUserDiscount(address),
        ]);
        return { content: formatResult({ walletInfo, stats, discount }) };
      } catch (error) {
        return handleError(error);
      }
    },
  );

  // ── Tool 8: get_orders_by_address ────────────────────────

  server.tool(
    'get_orders_by_address',
    'Get all orders (open, filled, settled) for a specific wallet address on Whales Market.',
    {
      address: z.string().describe('Wallet address'),
      page: z.number().optional().describe('Page number'),
      take: z.number().optional().describe('Items per page (default: 20)'),
    },
    async ({ address, ...params }) => {
      try {
        const result = await api.getOrdersByAddress(address, params);
        return { content: formatResult(result) };
      } catch (error) {
        return handleError(error);
      }
    },
  );

  // ── Tool 9: get_upcoming_tokens ──────────────────────────

  server.tool(
    'get_upcoming_tokens',
    'Get the list of upcoming tokens that will be available for trading on Whales Market.',
    {},
    async () => {
      try {
        const result = await api.getUpcomingTokens();
        return { content: formatResult(result) };
      } catch (error) {
        return handleError(error);
      }
    },
  );

  // ── Tool 10: get_leaderboard ─────────────────────────────

  server.tool(
    'get_leaderboard',
    'Get the referral leaderboard and live referral stats on Whales Market.',
    {
      page: z.number().optional().describe('Page number'),
      take: z.number().optional().describe('Items per page (default: 20)'),
    },
    async (params) => {
      try {
        const [leaderboard, liveStats] = await Promise.all([
          api.getReferralLeaderboard(params),
          api.getReferralLiveStats(),
        ]);
        return { content: formatResult({ leaderboard, liveStats }) };
      } catch (error) {
        return handleError(error);
      }
    },
  );

  // ── Tool 11: get_wallet_status ───────────────────────────

  server.tool(
    'get_wallet_status',
    'Get current wallet configuration and status: address, type (solana/evm), mode (agent/user), spend limits, and daily spend remaining. Reads from env config.',
    {},
    async () => {
      try {
        if (!wallet.hasWallet()) {
          return {
            content: formatResult({
              configured: false,
              message: 'No wallet configured. Use the setup_wallet tool to get started.',
            }),
          };
        }
        const status = wallet.getStatus();
        return { content: formatResult(status) };
      } catch (error) {
        return handleError(error);
      }
    },
  );

  // ── Tool 11b: setup_wallet ─────────────────────────────

  server.tool(
    'setup_wallet',
    'Interactive wallet setup guide. Checks current config, offers options to use existing wallet or generate a new dedicated agent wallet. Call this before any trading operation if no wallet is configured.',
    {
      action: z.enum(['status', 'generate', 'guide']).optional().describe(
        'Action: "status" = check current config, "generate" = create new Solana keypair for agent mode, "guide" = show setup instructions (default: "status")'
      ),
      wallet_type: z.enum(['solana', 'evm']).optional().describe('Wallet type for generate (default: solana)'),
    },
    async ({ action, wallet_type }) => {
      try {
        const act = action ?? 'status';

        // Status check
        if (act === 'status') {
          if (wallet.hasWallet()) {
            const status = wallet.getStatus();
            return {
              content: formatResult({
                configured: true,
                ...status,
                message: `Wallet configured in ${status.mode} mode. Ready to trade.`,
              }),
            };
          }
          return {
            content: formatResult({
              configured: false,
              message: 'No wallet configured.',
              options: [
                '1. Use your existing wallet (read-only): set WM_WALLET_ADDRESS=<your address>',
                '2. Generate a new agent wallet: call setup_wallet with action="generate"',
                '3. Use your own private key (full auto-trade): set WM_AGENT_PRIVATE_KEY=<key>',
              ],
              how_to_set: {
                claude_code: 'claude mcp update whales-market --env WM_WALLET_ADDRESS=<addr>',
                cursor: 'Settings → MCP → whales-market → env → add WM_WALLET_ADDRESS',
                manual: 'Set environment variable before starting MCP server',
              },
            }),
          };
        }

        // Generate new wallet — saves key to file, NEVER returns key in response
        if (act === 'generate') {
          const type = wallet_type ?? 'solana';
          const dataDir = process.env.WM_DATA_DIR || join(process.env.HOME || '/tmp', '.whales-market-mcp');
          const { mkdirSync: mkDir, writeFileSync: writeFile, chmodSync: chmod } = await import('fs');
          const { join: pathJoin } = await import('path');
          try { mkDir(dataDir, { recursive: true }); } catch { /* ignore */ }

          if (type === 'solana') {
            const keypair = Keypair.generate();
            const publicKey = keypair.publicKey.toBase58();
            const secretKey = bs58.encode(keypair.secretKey);

            // Save key to file with restricted permissions
            const keyFile = pathJoin(dataDir, `agent-key-${publicKey.slice(0, 8)}.txt`);
            writeFile(keyFile, secretKey, { mode: 0o600 });
            try { chmod(keyFile, 0o600); } catch { /* ignore on Windows */ }

            return {
              content: formatResult({
                generated: true,
                wallet_type: 'solana',
                address: publicKey,
                key_saved_to: keyFile,
                warning: '⚠️ Private key saved to file above. DO NOT share this file. Key is NOT shown in this response for security.',
                next_steps: [
                  `1. Key saved at: ${keyFile} (read-only by owner)`,
                  `2. Set env: WM_AGENT_PRIVATE_KEY=$(cat ${keyFile})`,
                  `3. Set env: WM_WALLET_TYPE=solana`,
                  `4. Fund the wallet: send SOL to ${publicKey}`,
                  `5. Restart MCP server`,
                ],
                setup_command: {
                  claude_code: `claude mcp update whales-market --env WM_AGENT_PRIVATE_KEY=$(cat ${keyFile}) --env WM_WALLET_TYPE=solana --env WM_DAILY_LIMIT=200 --env WM_SPEND_LIMIT_PER_TX=50`,
                },
                safety: {
                  per_tx_limit: '$50 (configurable via WM_SPEND_LIMIT_PER_TX)',
                  daily_limit: '$200 (configurable via WM_DAILY_LIMIT)',
                  tip: 'Only deposit what you can afford to lose. This is a dedicated agent wallet.',
                },
              }),
            };
          } else {
            const evmWallet = Wallet.createRandom();

            // Save key to file with restricted permissions
            const keyFile = pathJoin(dataDir, `agent-key-${evmWallet.address.slice(0, 10)}.txt`);
            writeFile(keyFile, evmWallet.privateKey, { mode: 0o600 });
            try { chmod(keyFile, 0o600); } catch { /* ignore on Windows */ }

            return {
              content: formatResult({
                generated: true,
                wallet_type: 'evm',
                address: evmWallet.address,
                key_saved_to: keyFile,
                warning: '⚠️ Private key saved to file above. DO NOT share this file. Key is NOT shown in this response for security.',
                next_steps: [
                  `1. Key saved at: ${keyFile} (read-only by owner)`,
                  `2. Set env: WM_AGENT_PRIVATE_KEY=$(cat ${keyFile})`,
                  `3. Set env: WM_WALLET_TYPE=evm`,
                  `4. Fund the wallet: send ETH/USDC to ${evmWallet.address}`,
                  `5. Restart MCP server`,
                ],
                setup_command: {
                  claude_code: `claude mcp update whales-market --env WM_AGENT_PRIVATE_KEY=$(cat ${keyFile}) --env WM_WALLET_TYPE=evm --env WM_DAILY_LIMIT=200 --env WM_SPEND_LIMIT_PER_TX=50`,
                },
                safety: {
                  per_tx_limit: '$50 (configurable via WM_SPEND_LIMIT_PER_TX)',
                  daily_limit: '$200 (configurable via WM_DAILY_LIMIT)',
                  tip: 'Only deposit what you can afford to lose. This is a dedicated agent wallet.',
                },
              }),
            };
          }
        }

        // Guide
        return {
          content: formatResult({
            guide: 'Whales Market MCP Wallet Setup',
            modes: {
              user_mode: {
                description: 'Read-only. View portfolio, offers, orders. Cannot trade.',
                env: 'WM_WALLET_ADDRESS=<your wallet address>',
                use_case: 'Monitor your positions without risk',
              },
              agent_mode: {
                description: 'Full autonomous trading. Agent signs transactions automatically.',
                env: 'WM_AGENT_PRIVATE_KEY=<private key>',
                use_case: 'Let AI trade on your behalf with safety limits',
                safety: [
                  'Use a DEDICATED wallet (not your main wallet)',
                  'Set spend limits: WM_SPEND_LIMIT_PER_TX (default $50)',
                  'Set daily cap: WM_DAILY_LIMIT (default $200)',
                  'Only deposit what you can afford to lose',
                ],
              },
            },
            recommendation: 'Start with user_mode to monitor. Switch to agent_mode when comfortable.',
          }),
        };
      } catch (error) {
        return handleError(error);
      }
    },
  );

  // ── Tool 12: get_order_book ─────────────────────────────

  server.tool(
    'get_order_book',
    'Get the order book for a token: buy/sell offers sorted by price, spread, and depth.',
    {
      symbol: z.string().describe('Token symbol (e.g., "HYPE", "PENGU")'),
      depth: z.number().optional().describe('Number of price levels per side (default: 10)'),
    },
    async ({ symbol, depth }) => {
      try {
        const response = await api.getOffers({
          symbol,
          token_id: undefined,
          offer_type: undefined,
          status: 'open',
          page: 1,
          take: 200,
        });

        // Extract offers list from response
        let offers: Record<string, unknown>[] = [];
        const res = response as Record<string, unknown>;
        if (res.data && typeof res.data === 'object' && 'list' in (res.data as Record<string, unknown>)) {
          offers = (res.data as Record<string, unknown>).list as Record<string, unknown>[];
        } else if (Array.isArray(res.data)) {
          offers = res.data as Record<string, unknown>[];
        } else if (Array.isArray(res.list)) {
          offers = res.list as Record<string, unknown>[];
        }

        // Filter by symbol
        const symbolUpper = symbol.toUpperCase();
        const filtered = offers.filter((o) => {
          const tokenSymbol = String(o.token_symbol || o.symbol || '').toUpperCase();
          return tokenSymbol === symbolUpper;
        });

        const book = buildOrderBook(filtered, symbolUpper, depth ?? 10);
        return { content: formatResult(book) };
      } catch (error) {
        return handleError(error);
      }
    },
  );

  // ── Tool 13: get_my_offers ──────────────────────────────

  server.tool(
    'get_my_offers',
    'Get your open/filled offers on Whales Market. Requires wallet config and symbol.',
    {
      symbol: z.string().describe('Token symbol (required by API)'),
      page: z.number().optional().describe('Page number'),
      take: z.number().optional().describe('Items per page (default: 20)'),
    },
    async (params) => {
      try {
        const address = wallet.getAddress();
        const result = await api.getOffersByAddress(address, params);
        return { content: formatResult(result) };
      } catch (error) {
        return handleError(error);
      }
    },
  );

  // ── Tool 14: get_my_orders ──────────────────────────────

  server.tool(
    'get_my_orders',
    'Get your orders on Whales Market. Requires wallet config (WM_AGENT_PRIVATE_KEY or WM_WALLET_ADDRESS).',
    {
      page: z.number().optional().describe('Page number'),
      take: z.number().optional().describe('Items per page (default: 20)'),
    },
    async (params) => {
      try {
        const address = wallet.getAddress();
        const result = await api.getOrdersByAddress(address, params);
        return { content: formatResult(result) };
      } catch (error) {
        return handleError(error);
      }
    },
  );

  // ── Tool 15: get_my_portfolio ───────────────────────────

  server.tool(
    'get_my_portfolio',
    'Get portfolio summary: offers, orders, positions count. Requires wallet config and symbol.',
    {
      symbol: z.string().describe('Token symbol (required by API)'),
    },
    async ({ symbol }) => {
      try {
        const address = wallet.getAddress();

        const [offersRes, ordersRes] = await Promise.all([
          api.getOffersByAddress(address, { symbol }).catch(() => ({ data: [] })),
          api.getOrdersByAddress(address).catch(() => ({ data: [] })),
        ]);

        const offers = (offersRes as Record<string, unknown>).data;
        const orders = (ordersRes as Record<string, unknown>).data;
        const offersList = Array.isArray(offers) ? offers : [];
        const ordersList = Array.isArray(orders) ? orders : [];

        const openOffers = offersList.filter((o: Record<string, unknown>) => o.status === 'open').length;
        const filledOrders = ordersList.filter((o: Record<string, unknown>) => o.status === 'filled').length;

        return {
          content: formatResult({
            address,
            totalOffers: offersList.length,
            totalOrders: ordersList.length,
            openOffers,
            filledOrders,
            offers: offersList,
            orders: ordersList,
          }),
        };
      } catch (error) {
        return handleError(error);
      }
    },
  );

  // ── Tool 16: get_balance ────────────────────────────────

  server.tool(
    'get_balance',
    'Get on-chain balance of a wallet. Defaults to configured wallet address. Supports Solana (SOL) and EVM (ETH).',
    {
      address: z.string().optional().describe('Wallet address (defaults to configured wallet)'),
    },
    async ({ address }) => {
      try {
        const result = await wallet.getBalance(address);
        return { content: formatResult(result) };
      } catch (error) {
        return handleError(error);
      }
    },
  );

  // ── Tool 17: get_networks ──────────────────────────────

  server.tool(
    'get_networks',
    'List supported blockchain networks on Whales Market.',
    {},
    async () => {
      try {
        const result = await api.getNetworkChains();
        return { content: formatResult(result) };
      } catch (error) {
        return handleError(error);
      }
    },
  );

  // ── Tool 18: create_buy_intent ──────────────────────────

  server.tool(
    'create_buy_intent',
    'Create a buy offer on Whales Market. Agent mode: validates limits, signs, and executes. User mode: returns preview. Requires wallet config.',
    {
      symbol: z.string().describe('Token symbol'),
      amount: z.number().positive().describe('Amount of tokens to buy'),
      price: z.number().positive().describe('Price per token in USD'),
      dry_run: z.boolean().optional().describe('If true, returns preview without executing (default: false)'),
    },
    async ({ symbol, amount, price, dry_run }) => {
      try {
        const result = await executeTradeIntent(api, wallet, {
          symbol,
          amount,
          price,
          side: 'buy',
          totalValue: amount * price,
          dryRun: dry_run ?? false,
        });
        return {
          content: formatResult(result),
          ...(result.success ? {} : { isError: true as const }),
        };
      } catch (error) {
        return handleError(error);
      }
    },
  );

  // ── Tool 19: create_sell_intent ─────────────────────────

  server.tool(
    'create_sell_intent',
    'Create a sell offer on Whales Market. Agent mode: validates limits, signs, and executes. User mode: returns preview. Requires wallet config.',
    {
      symbol: z.string().describe('Token symbol'),
      amount: z.number().positive().describe('Amount of tokens to sell'),
      price: z.number().positive().describe('Price per token in USD'),
      dry_run: z.boolean().optional().describe('If true, returns preview without executing (default: false)'),
    },
    async ({ symbol, amount, price, dry_run }) => {
      try {
        const result = await executeTradeIntent(api, wallet, {
          symbol,
          amount,
          price,
          side: 'sell',
          totalValue: amount * price,
          dryRun: dry_run ?? false,
        });
        return {
          content: formatResult(result),
          ...(result.success ? {} : { isError: true as const }),
        };
      } catch (error) {
        return handleError(error);
      }
    },
  );

  // ── Tool 20: react_to_offer ─────────────────────────────

  server.tool(
    'react_to_offer',
    'Accept/fill an existing offer on Whales Market. Agent mode: signs and executes. User mode: returns preview. Requires wallet config. For EVM chains, provide chain_id or symbol to auto-detect.',
    {
      offer_id: z.string().describe('Offer ID to react to'),
      amount: z.number().positive().optional().describe('Amount for partial fill (omit for full fill)'),
      dry_run: z.boolean().optional().describe('If true, returns preview without executing (default: false)'),
      chain_id: z.number().optional().describe('Chain ID for EVM offers (auto-detected from symbol if provided)'),
      symbol: z.string().optional().describe('Token symbol — used to auto-detect chain if chain_id not provided'),
    },
    async ({ offer_id, amount, dry_run, chain_id, symbol }) => {
      try {
        // Auto-detect chain from symbol if chain_id not provided
        let resolvedChainId = chain_id;
        if (!resolvedChainId && symbol) {
          try {
            const chainInfo = await resolveTokenChainInfo(api, symbol);
            resolvedChainId = chainInfo.chainId;
          } catch { /* fall through to default Solana path */ }
        }
        const result = await reactToOffer(api, wallet, offer_id, amount, dry_run ?? false, resolvedChainId);
        return {
          content: formatResult(result),
          ...(result.success ? {} : { isError: true as const }),
        };
      } catch (error) {
        return handleError(error);
      }
    },
  );

  // ── Tool 21: cancel_offer ──────────────────────────────

  server.tool(
    'cancel_offer',
    'Cancel your own offer on Whales Market. Agent mode: signs and executes. User mode: returns preview. Requires wallet config. For EVM chains, provide chain_id or symbol to auto-detect.',
    {
      offer_id: z.string().describe('Offer ID to cancel'),
      dry_run: z.boolean().optional().describe('If true, returns preview without executing (default: false)'),
      chain_id: z.number().optional().describe('Chain ID for EVM offers (auto-detected from symbol if provided)'),
      symbol: z.string().optional().describe('Token symbol — used to auto-detect chain if chain_id not provided'),
    },
    async ({ offer_id, dry_run, chain_id, symbol }) => {
      try {
        let resolvedChainId = chain_id;
        if (!resolvedChainId && symbol) {
          try {
            const chainInfo = await resolveTokenChainInfo(api, symbol);
            resolvedChainId = chainInfo.chainId;
          } catch { /* fall through to default Solana path */ }
        }
        const result = await cancelOffer(api, wallet, offer_id, dry_run ?? false, resolvedChainId);
        return {
          content: formatResult(result),
          ...(result.success ? {} : { isError: true as const }),
        };
      } catch (error) {
        return handleError(error);
      }
    },
  );

  // ── Tool 21b: cancel_order ─────────────────────────────

  server.tool(
    'cancel_order',
    'Cancel an unfilled order on Whales Market. Calls settleCancelled on-chain. Agent mode: signs and executes. For EVM chains, provide chain_id or symbol.',
    {
      order_id: z.string().describe('Order ID to cancel'),
      dry_run: z.boolean().optional().describe('If true, returns preview without executing (default: false)'),
      chain_id: z.number().optional().describe('Chain ID for EVM orders (auto-detected from symbol if provided)'),
      symbol: z.string().optional().describe('Token symbol — used to auto-detect chain if chain_id not provided'),
    },
    async ({ order_id, dry_run, chain_id, symbol }) => {
      try {
        let resolvedChainId = chain_id;
        if (!resolvedChainId && symbol) {
          try {
            const chainInfo = await resolveTokenChainInfo(api, symbol);
            resolvedChainId = chainInfo.chainId;
          } catch { /* fall through to default Solana path */ }
        }
        const result = await cancelOrder(api, wallet, order_id, dry_run ?? false, resolvedChainId);
        return {
          content: formatResult(result),
          ...(result.success ? {} : { isError: true as const }),
        };
      } catch (error) {
        return handleError(error);
      }
    },
  );

  // ── Tool 22: check_intent_status ────────────────────────

  server.tool(
    'check_intent_status',
    'Check the status of a previously created intent/offer on Whales Market.',
    {
      offer_id: z.string().describe('Offer ID to check'),
    },
    async ({ offer_id }) => {
      try {
        const result = await api.getOfferDetail(offer_id);
        return { content: formatResult(result) };
      } catch (error) {
        return handleError(error);
      }
    },
  );

  return server;
}

// ── Start Server ─────────────────────────────────────────

async function main() {
  const httpPort = process.env.MCP_HTTP_PORT ? parseInt(process.env.MCP_HTTP_PORT, 10) : undefined;

  if (httpPort) {
    await startHttpServer(httpPort);
  } else {
    await startStdioServer();
  }
}

async function startStdioServer() {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`whales-market-mcp running on stdio (API: ${API_URL})`);
}

async function startHttpServer(port: number) {
  const { default: express } = await import('express');
  const { default: cors } = await import('cors');

  const host = process.env.MCP_HTTP_HOST || '127.0.0.1'; // localhost only by default for security
  const app = express();
  app.use(cors());
  app.use(express.json());

  // Session management: map sessionId → transport
  const transports: Record<string, StreamableHTTPServerTransport> = {};

  // POST /mcp — main JSON-RPC endpoint
  app.post('/mcp', async (req, res) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;

    try {
      // Reuse existing session
      if (sessionId && transports[sessionId]) {
        await transports[sessionId].handleRequest(req, res, req.body);
        return;
      }

      // New initialization request
      if (!sessionId && isInitializeRequest(req.body)) {
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (sid) => {
            transports[sid] = transport;
            console.error(`Session initialized: ${sid}`);
          },
        });

        transport.onclose = () => {
          const sid = transport.sessionId;
          if (sid && transports[sid]) {
            delete transports[sid];
            console.error(`Session closed: ${sid}`);
          }
        };

        const server = createServer();
        await server.connect(transport);
        await transport.handleRequest(req, res, req.body);
        return;
      }

      // Invalid request
      res.status(400).json({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'Bad Request: No valid session ID provided' },
        id: null,
      });
    } catch (error) {
      console.error('Error handling POST /mcp:', error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: { code: -32603, message: 'Internal server error' },
          id: null,
        });
      }
    }
  });

  // GET /mcp — SSE stream for server-initiated messages
  app.get('/mcp', async (req, res) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    if (!sessionId || !transports[sessionId]) {
      res.status(400).send('Invalid or missing session ID');
      return;
    }
    await transports[sessionId].handleRequest(req, res);
  });

  // DELETE /mcp — session termination
  app.delete('/mcp', async (req, res) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    if (!sessionId || !transports[sessionId]) {
      res.status(400).send('Invalid or missing session ID');
      return;
    }
    await transports[sessionId].handleRequest(req, res);
  });

  // Health check — ping Whales Market API
  app.get('/health', async (_req, res) => {
    try {
      await api.getMarketStats();
      res.json({ status: 'ok', transport: 'http', api: API_URL });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(503).json({ status: 'error', transport: 'http', api: API_URL, error: message });
    }
  });

  app.listen(port, host, () => {
    console.error(`whales-market-mcp running on http://${host}:${port}/mcp (API: ${API_URL})`);
  });

  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.error('Shutting down...');
    for (const sid of Object.keys(transports)) {
      await transports[sid].close();
      delete transports[sid];
    }
    process.exit(0);
  });
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
