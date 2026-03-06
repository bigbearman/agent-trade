// Solana Pre-Market contract constants

export const WEI6 = 1_000_000;

// Pre-Market contract addresses (from whale-market-cli constants.ts)
// Devnet
export const DEVNET_PROGRAM_ID = 'F8iCXCQDmUSNVB8zD7WmkDumKTqxWaMfMSXtNmRUtw4q';
export const DEVNET_CONFIG_ACCOUNT = '7e3Frd6t4adXx3RXPyqh28ZuBBSdzkSmuFJCphsfF773';
export const DEVNET_FEE_WALLET = ''; // not set on devnet
export const DEVNET_RPC = 'https://api.devnet.solana.com';

// Mainnet
export const MAINNET_PROGRAM_ID = 'stPdYNaJNsV3ytS9Xtx4GXXXRcVqVS6x66ZFa26K39S';
export const MAINNET_CONFIG_ACCOUNT = 'GDsMbTq82sYcxPRLdQ9RHL9ZLY3HNVpXjXtCnyxpb2rQ';
export const MAINNET_FEE_WALLET = '8FzAESKaw5yFZjDNNX7SU98gTEKZF6n57W94ehw38KRN';
export const MAINNET_RPC = 'https://api.mainnet-beta.solana.com';

// OTC Pre-Market contract addresses
export const OTC_DEVNET_PROGRAM_ID = 'G36EWnoEPDWy62Lz9cYdi7R7LvQngsbgrZSmZKkLtAa9';
export const OTC_MAINNET_PROGRAM_ID = '5BA233jRRKAZsY765p72CXGZn5F5DMxtnP2ShhbJ2UBp';

// Default compute budget
export const DEFAULT_COMPUTE_UNIT_PRICE = 200_000; // microLamports
export const DEFAULT_COMPUTE_UNIT_LIMIT = 200_000;
export const COMPUTE_UNIT_BUFFER = 1.25; // 25% buffer on simulated CU

/**
 * Auto-detect network from WM_API_URL env var.
 * If it contains "dev" -> devnet, otherwise mainnet.
 */
export function getNetworkConfig(): {
  programId: string;
  configAccount: string;
  rpcUrl: string;
  isDevnet: boolean;
} {
  const apiUrl = process.env.WM_API_URL || '';
  const isDevnet = apiUrl.toLowerCase().includes('dev');

  return {
    programId: process.env.WM_PROGRAM_ID || (isDevnet ? DEVNET_PROGRAM_ID : MAINNET_PROGRAM_ID),
    configAccount: process.env.WM_CONFIG_ACCOUNT || (isDevnet ? DEVNET_CONFIG_ACCOUNT : MAINNET_CONFIG_ACCOUNT),
    rpcUrl: process.env.WM_SOLANA_RPC || (isDevnet ? DEVNET_RPC : MAINNET_RPC),
    isDevnet,
  };
}
