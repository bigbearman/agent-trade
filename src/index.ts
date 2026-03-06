#!/usr/bin/env node

import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

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

import { WalletManager } from './core/wallet.js';
import { formatResult, handleError } from './core/utils.js';
import { AdapterRegistry } from './registry.js';
import { WhalesMarketAdapter } from './adapters/whales-market/index.js';
import { PolymarketAdapter } from './adapters/polymarket/index.js';

// ── Bootstrap ────────────────────────────────────────────

const wallet = new WalletManager();
const registry = new AdapterRegistry();

// Register adapters based on AGENT_TRADE_VENUES env (default: all available)
const enabledVenues = (process.env.AGENT_TRADE_VENUES || 'whales-market,polymarket').split(',').map((v) => v.trim());

if (enabledVenues.includes('whales-market')) {
  registry.register(new WhalesMarketAdapter(wallet));
}

if (enabledVenues.includes('polymarket')) {
  registry.register(new PolymarketAdapter(wallet));
}

// ── Create Server ─────────────────────────────────────────

function createServer(): McpServer {
  const server = new McpServer({
    name: 'agent-trade',
    version: PKG_VERSION,
  });

  // ── Universal Tool: list_venues ────────────────────────

  server.tool(
    'list_venues',
    'List all available and configured trading venues.',
    {},
    async () => {
      try {
        const venues = registry.list().map((a) => ({
          name: a.name,
          displayName: a.displayName,
          configured: a.isConfigured(),
        }));
        return { content: formatResult(venues) };
      } catch (error) {
        return handleError(error);
      }
    },
  );

  // ── Universal Tool: search_markets ─────────────────────

  server.tool(
    'search_markets',
    'Search and list markets across trading venues. Filter by venue, category, name/symbol.',
    {
      venue: z.string().optional().describe('Specific venue (e.g., "whales-market"). Omit to search all.'),
      search: z.string().optional().describe('Search by name or symbol'),
      category: z.string().optional().describe('Market category filter'),
      status: z.string().optional().describe('Status filter'),
      chain_id: z.number().optional().describe('Blockchain chain ID'),
      sortField: z.string().optional().describe('Sort field'),
      sortType: z.enum(['ASC', 'DESC']).optional().describe('Sort direction'),
      page: z.number().optional().describe('Page number (default: 1)'),
      take: z.number().optional().describe('Items per page (default: 20, max: 50)'),
    },
    async (params) => {
      try {
        const { venue, ...searchParams } = params;
        const adapters = venue ? [registry.require(venue)] : registry.getConfigured();
        const results = await Promise.all(adapters.map((a) => a.searchMarkets(searchParams)));
        return { content: formatResult(results.flat()) };
      } catch (error) {
        return handleError(error);
      }
    },
  );

  // ── Universal Tool: get_market ─────────────────────────

  server.tool(
    'get_market',
    'Get detailed information about a specific market/token.',
    {
      venue: z.string().optional().describe('Venue name (auto-detected if only one configured)'),
      market_id: z.string().describe('Market ID or symbol (e.g., "HYPE", "GRASS")'),
    },
    async ({ venue, market_id }) => {
      try {
        const adapter = venue ? registry.require(venue) : registry.requireAny();
        const result = await adapter.getMarketDetail(market_id);
        return { content: formatResult(result) };
      } catch (error) {
        return handleError(error);
      }
    },
  );

  // ── Universal Tool: get_order_book ─────────────────────

  server.tool(
    'get_order_book',
    'Get the order book for a market: bids, asks, spread.',
    {
      venue: z.string().optional().describe('Venue name'),
      market_id: z.string().describe('Market ID or symbol'),
      depth: z.number().optional().describe('Number of price levels per side (default: 10)'),
    },
    async ({ venue, market_id, depth }) => {
      try {
        const adapter = venue ? registry.require(venue) : registry.requireAny();
        const book = await adapter.getOrderBook(market_id, depth);

        const bestBid = book.bids.length > 0 ? book.bids[0].price : 0;
        const bestAsk = book.asks.length > 0 ? book.asks[0].price : 0;
        const spread = bestAsk && bestBid ? bestAsk - bestBid : 0;
        const spreadPercent = bestBid > 0 ? (spread / bestBid) * 100 : 0;

        return {
          content: formatResult({
            market: market_id,
            bids: book.bids,
            asks: book.asks,
            bestBid,
            bestAsk,
            spread,
            spreadPercent,
          }),
        };
      } catch (error) {
        return handleError(error);
      }
    },
  );

  // ── Universal Tool: get_recent_trades ──────────────────

  server.tool(
    'get_recent_trades',
    'Get recent trades for a market or across all markets.',
    {
      venue: z.string().optional().describe('Venue name'),
      market_id: z.string().optional().describe('Market ID (omit for all markets)'),
      limit: z.number().optional().describe('Number of trades (default: 20)'),
    },
    async ({ venue, market_id, limit }) => {
      try {
        const adapter = venue ? registry.require(venue) : registry.requireAny();
        const result = await adapter.getRecentTrades(market_id || '', limit);
        return { content: formatResult(result) };
      } catch (error) {
        return handleError(error);
      }
    },
  );

  // ── Universal Tool: trade ──────────────────────────────

  server.tool(
    'trade',
    'Create a buy/sell order. Agent mode: validates limits, signs, and executes. User mode: returns preview.',
    {
      venue: z.string().optional().describe('Venue name'),
      market_id: z.string().describe('Market ID or symbol'),
      side: z.enum(['buy', 'sell']).describe('Trade side'),
      amount: z.number().positive().describe('Amount of tokens'),
      price: z.number().positive().describe('Price per token in USD'),
      dry_run: z.boolean().optional().describe('Preview without executing (default: false)'),
    },
    async ({ venue, market_id, side, amount, price, dry_run }) => {
      try {
        const adapter = venue ? registry.require(venue) : registry.requireAny();
        const mode = wallet.isAgentMode && !(dry_run ?? false) ? 'agent' : 'user';
        const result = await adapter.trade({
          market_id,
          side,
          amount,
          price,
          mode,
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

  // ── Universal Tool: cancel ─────────────────────────────

  server.tool(
    'cancel',
    'Cancel an open order/offer.',
    {
      venue: z.string().optional().describe('Venue name'),
      order_id: z.string().describe('Order/offer ID to cancel'),
      chain_id: z.number().optional().describe('Chain ID for EVM (auto-detected if possible)'),
    },
    async ({ venue, order_id, chain_id }) => {
      try {
        const adapter = venue ? registry.require(venue) : registry.requireAny();
        const result = await adapter.cancel(order_id, { chain_id });
        return {
          content: formatResult(result),
          ...(result.success ? {} : { isError: true as const }),
        };
      } catch (error) {
        return handleError(error);
      }
    },
  );

  // ── Universal Tool: get_positions ──────────────────────

  server.tool(
    'get_positions',
    'Get portfolio/positions for your wallet or a specific address.',
    {
      venue: z.string().optional().describe('Venue name'),
      address: z.string().optional().describe('Wallet address (defaults to configured wallet)'),
    },
    async ({ venue, address }) => {
      try {
        const adapter = venue ? registry.require(venue) : registry.requireAny();
        const addr = address || wallet.getAddress();
        const result = await adapter.getPositions(addr);
        return { content: formatResult(result) };
      } catch (error) {
        return handleError(error);
      }
    },
  );

  // ── Universal Tool: get_orders ─────────────────────────

  server.tool(
    'get_orders',
    'Get open orders for your wallet or a specific address.',
    {
      venue: z.string().optional().describe('Venue name'),
      address: z.string().optional().describe('Wallet address (defaults to configured wallet)'),
    },
    async ({ venue, address }) => {
      try {
        const adapter = venue ? registry.require(venue) : registry.requireAny();
        const addr = address || wallet.getAddress();
        const result = await adapter.getOpenOrders(addr);
        return { content: formatResult(result) };
      } catch (error) {
        return handleError(error);
      }
    },
  );

  // ── Universal Tool: wallet_status ──────────────────────

  server.tool(
    'wallet_status',
    'Get wallet configuration, balance, and spend limits.',
    {},
    async () => {
      try {
        if (!wallet.hasWallet()) {
          return {
            content: formatResult({
              configured: false,
              message: 'No wallet configured. Use setup_wallet tool or set AT_AGENT_PRIVATE_KEY / AT_WALLET_ADDRESS.',
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

  // ── Universal Tool: setup_wallet ───────────────────────

  server.tool(
    'setup_wallet',
    'Wallet setup guide. Check config, generate a new agent wallet, or show setup instructions.',
    {
      action: z.enum(['status', 'generate', 'guide']).optional().describe('Action: status, generate, or guide (default: status)'),
      wallet_type: z.enum(['solana', 'evm']).optional().describe('Wallet type for generate (default: solana)'),
    },
    async ({ action, wallet_type }) => {
      try {
        const act = action ?? 'status';

        if (act === 'status') {
          if (wallet.hasWallet()) {
            const status = wallet.getStatus();
            return {
              content: formatResult({
                configured: true,
                ...status,
                venues: registry.getConfigured().map((a) => a.name),
                message: `Wallet configured in ${status.mode} mode. Ready to trade.`,
              }),
            };
          }
          return {
            content: formatResult({
              configured: false,
              venues: registry.list().map((a) => a.name),
              message: 'No wallet configured.',
              options: [
                '1. Read-only: set AT_WALLET_ADDRESS=<your address>',
                '2. Generate new: call setup_wallet with action="generate"',
                '3. Use your key: set AT_AGENT_PRIVATE_KEY=<key>',
              ],
            }),
          };
        }

        if (act === 'generate') {
          const type = wallet_type ?? 'solana';
          const dataDir = process.env.AT_DATA_DIR || process.env.WM_DATA_DIR || join(process.env.HOME || '/tmp', '.agent-trade');
          const { mkdirSync: mkDir, writeFileSync: writeFile, chmodSync: chmod } = await import('fs');
          const { join: pathJoin } = await import('path');
          try { mkDir(dataDir, { recursive: true }); } catch { /* ignore */ }

          if (type === 'solana') {
            const keypair = Keypair.generate();
            const publicKey = keypair.publicKey.toBase58();
            const secretKey = bs58.encode(keypair.secretKey);
            const keyFile = pathJoin(dataDir, `agent-key-${publicKey.slice(0, 8)}.txt`);
            writeFile(keyFile, secretKey, { mode: 0o600 });
            try { chmod(keyFile, 0o600); } catch { /* ignore on Windows */ }

            return {
              content: formatResult({
                generated: true,
                wallet_type: 'solana',
                address: publicKey,
                key_saved_to: keyFile,
                warning: 'Private key saved to file above. DO NOT share. Key is NOT shown in this response.',
                next_steps: [
                  `1. Key saved at: ${keyFile}`,
                  `2. Set env: AT_AGENT_PRIVATE_KEY=$(cat ${keyFile})`,
                  `3. Set env: AT_WALLET_TYPE=solana`,
                  `4. Fund the wallet: send SOL to ${publicKey}`,
                  `5. Restart MCP server`,
                ],
                safety: {
                  per_tx_limit: '$50 (AT_SPEND_LIMIT_PER_TX)',
                  daily_limit: '$200 (AT_DAILY_LIMIT)',
                },
              }),
            };
          } else {
            const evmWallet = Wallet.createRandom();
            const keyFile = pathJoin(dataDir, `agent-key-${evmWallet.address.slice(0, 10)}.txt`);
            writeFile(keyFile, evmWallet.privateKey, { mode: 0o600 });
            try { chmod(keyFile, 0o600); } catch { /* ignore on Windows */ }

            return {
              content: formatResult({
                generated: true,
                wallet_type: 'evm',
                address: evmWallet.address,
                key_saved_to: keyFile,
                warning: 'Private key saved to file above. DO NOT share. Key is NOT shown in this response.',
                next_steps: [
                  `1. Key saved at: ${keyFile}`,
                  `2. Set env: AT_AGENT_PRIVATE_KEY=$(cat ${keyFile})`,
                  `3. Set env: AT_WALLET_TYPE=evm`,
                  `4. Fund the wallet: send ETH/USDC to ${evmWallet.address}`,
                  `5. Restart MCP server`,
                ],
                safety: {
                  per_tx_limit: '$50 (AT_SPEND_LIMIT_PER_TX)',
                  daily_limit: '$200 (AT_DAILY_LIMIT)',
                },
              }),
            };
          }
        }

        // Guide
        return {
          content: formatResult({
            guide: 'agent-trade Wallet Setup',
            venues: registry.list().map((a) => ({ name: a.name, displayName: a.displayName, configured: a.isConfigured() })),
            modes: {
              user_mode: {
                description: 'Read-only. View portfolio, offers, orders. Cannot trade.',
                env: 'AT_WALLET_ADDRESS=<your wallet address>',
              },
              agent_mode: {
                description: 'Full autonomous trading. Agent signs transactions automatically.',
                env: 'AT_AGENT_PRIVATE_KEY=<private key>',
                safety: [
                  'Use a DEDICATED wallet (not your main wallet)',
                  'Set spend limits: AT_SPEND_LIMIT_PER_TX (default $50)',
                  'Set daily cap: AT_DAILY_LIMIT (default $200)',
                ],
              },
            },
          }),
        };
      } catch (error) {
        return handleError(error);
      }
    },
  );

  // ── Register custom tools from adapters ────────────────

  for (const adapter of registry.getConfigured()) {
    const customTools = adapter.getCustomTools?.() || [];
    for (const tool of customTools) {
      // Convert plain schema to zod schema for MCP SDK compatibility
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const zodSchema: Record<string, any> = {};
      for (const [key, def] of Object.entries(tool.schema || {})) {
        const d = def as { type?: string; description?: string };
        const base = d.type === 'number' ? z.coerce.number() : z.string();
        zodSchema[key] = d.description ? base.optional().describe(d.description) : base.optional();
      }
      server.tool(
        tool.name,
        tool.description,
        zodSchema,
        async (params: Record<string, unknown>) => {
          try {
            const result = await tool.handler(params);
            return { content: formatResult(result) };
          } catch (error) {
            return handleError(error);
          }
        },
      );
    }
  }

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
  const venues = registry.getConfigured().map((a) => a.name).join(', ');
  console.error(`agent-trade running on stdio (venues: ${venues})`);
}

async function startHttpServer(port: number) {
  const { default: express } = await import('express');
  const { default: cors } = await import('cors');

  const host = process.env.MCP_HTTP_HOST || '127.0.0.1';
  const app = express();
  app.use(cors());
  app.use(express.json());

  const transports: Record<string, StreamableHTTPServerTransport> = {};

  app.post('/mcp', async (req, res) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;

    try {
      if (sessionId && transports[sessionId]) {
        await transports[sessionId].handleRequest(req, res, req.body);
        return;
      }

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

  app.get('/mcp', async (req, res) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    if (!sessionId || !transports[sessionId]) {
      res.status(400).send('Invalid or missing session ID');
      return;
    }
    await transports[sessionId].handleRequest(req, res);
  });

  app.delete('/mcp', async (req, res) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    if (!sessionId || !transports[sessionId]) {
      res.status(400).send('Invalid or missing session ID');
      return;
    }
    await transports[sessionId].handleRequest(req, res);
  });

  app.get('/health', async (_req, res) => {
    const venues = registry.getConfigured().map((a) => a.name);
    res.json({ status: 'ok', transport: 'http', venues });
  });

  app.listen(port, host, () => {
    const venues = registry.getConfigured().map((a) => a.name).join(', ');
    console.error(`agent-trade running on http://${host}:${port}/mcp (venues: ${venues})`);
  });

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
