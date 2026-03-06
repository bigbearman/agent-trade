// EVM chain IDs, RPC endpoints, and deployed contract addresses.
// Contract addresses sourced from /ref/contracts-fe-integration/config/contract.ts
// RPC URLs sourced from /ref/contracts-fe-integration/config/chains.config.ts

export interface EvmChainConfig {
  name: string;
  rpcUrl: string;
  explorerUrl: string;
  nativeCurrency: { name: string; symbol: string; decimals: number };
}

// ─── Mainnet chains ───────────────────────────────────────────────────────────

export const EVM_CHAINS: Record<number, EvmChainConfig> = {
  1: {
    name: 'Ethereum',
    rpcUrl: 'https://eth.llamarpc.com',
    explorerUrl: 'https://etherscan.io',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  },
  42161: {
    name: 'Arbitrum',
    rpcUrl: 'https://arbitrum.public.blockpi.network/v1/rpc/public',
    explorerUrl: 'https://arbiscan.io',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  },
  43114: {
    name: 'Avalanche',
    rpcUrl: 'https://endpoints.omniatech.io/v1/avax/mainnet/public',
    explorerUrl: 'https://snowtrace.io',
    nativeCurrency: { name: 'Avalanche', symbol: 'AVAX', decimals: 18 },
  },
  8453: {
    name: 'Base',
    rpcUrl: 'https://mainnet.base.org',
    explorerUrl: 'https://basescan.org',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  },
  80094: {
    name: 'Berachain',
    rpcUrl: 'https://rpc.berachain-apis.com',
    explorerUrl: 'https://beratrail.io',
    nativeCurrency: { name: 'Bera', symbol: 'BERA', decimals: 18 },
  },
  81457: {
    name: 'Blast',
    rpcUrl: 'https://rpc.blast.io',
    explorerUrl: 'https://blastscan.io',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  },
  56: {
    name: 'BSC',
    rpcUrl: 'https://bsc-rpc.publicnode.com',
    explorerUrl: 'https://bscscan.com',
    nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
  },
  999: {
    name: 'Hyperliquid',
    rpcUrl: 'https://rpc.hyperliquid.xyz/evm',
    explorerUrl: 'https://hyperevmscan.io',
    nativeCurrency: { name: 'Hyperliquid', symbol: 'HYPE', decimals: 18 },
  },
  59144: {
    name: 'Linea',
    rpcUrl: 'https://linea-rpc.publicnode.com',
    explorerUrl: 'https://lineascan.build',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  },
  169: {
    name: 'Manta Pacific',
    rpcUrl: 'https://manta.nirvanalabs.xyz/mantapublic',
    explorerUrl: 'https://pacific-explorer.manta.network',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  },
  4200: {
    name: 'Merlin',
    rpcUrl: 'https://rpc.merlinchain.io',
    explorerUrl: 'https://scan.merlinchain.io',
    nativeCurrency: { name: 'Bitcoin', symbol: 'BTC', decimals: 8 },
  },
  34443: {
    name: 'Mode',
    rpcUrl: 'https://mainnet.mode.network',
    explorerUrl: 'https://explorer.mode.network',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  },
  2818: {
    name: 'Morph',
    rpcUrl: 'https://rpc-quicknode.morphl2.io',
    explorerUrl: 'https://explorer.morphl2.io',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  },
  143: {
    name: 'Monad',
    rpcUrl: 'https://rpc-mainnet.monadinfra.com',
    explorerUrl: 'https://monadvision.com',
    nativeCurrency: { name: 'Monad', symbol: 'MON', decimals: 18 },
  },
  10: {
    name: 'Optimism',
    rpcUrl: 'https://optimism-mainnet.public.blastapi.io',
    explorerUrl: 'https://optimistic.etherscan.io',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  },
  534352: {
    name: 'Scroll',
    rpcUrl: 'https://rpc.scroll.io',
    explorerUrl: 'https://scrollscan.com',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  },
  146: {
    name: 'Sonic',
    rpcUrl: 'https://sonic-json-rpc.stakely.io',
    explorerUrl: 'https://explorer.soniclabs.com',
    nativeCurrency: { name: 'Sonic', symbol: 'S', decimals: 18 },
  },
  167000: {
    name: 'Taiko',
    rpcUrl: 'https://rpc.mainnet.taiko.xyz',
    explorerUrl: 'https://explorer.a2.taiko.xyz',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  },
  2741: {
    name: 'Abstract',
    rpcUrl: 'https://api.mainnet.abs.xyz',
    explorerUrl: 'https://abscan.org',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  },
  324: {
    name: 'zkSync Era',
    rpcUrl: 'https://mainnet.era.zksync.io',
    explorerUrl: 'https://explorer.zksync.io',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  },

  // ─── Testnets ──────────────────────────────────────────────────────────────

  11155111: {
    name: 'Sepolia',
    rpcUrl: 'https://ethereum-sepolia-rpc.publicnode.com',
    explorerUrl: 'https://sepolia.etherscan.io',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  },
  421614: {
    name: 'Arbitrum Sepolia',
    rpcUrl: 'https://arbitrum-sepolia.therpc.io',
    explorerUrl: 'https://sepolia.arbiscan.io',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  },
  84532: {
    name: 'Base Sepolia',
    rpcUrl: 'https://sepolia.base.org',
    explorerUrl: 'https://sepolia.basescan.org',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  },
  80084: {
    name: 'Berachain Testnet',
    rpcUrl: 'https://bepolia.rpc.berachain.com',
    explorerUrl: 'https://artio.beratrail.io',
    nativeCurrency: { name: 'Bera', symbol: 'BERA', decimals: 18 },
  },
  168587773: {
    name: 'Blast Sepolia',
    rpcUrl: 'https://rpc.ankr.com/blast_testnet_sepolia',
    explorerUrl: 'https://testnet.blastscan.io',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  },
  97: {
    name: 'BSC Testnet',
    rpcUrl: 'https://bsc-testnet-rpc.publicnode.com',
    explorerUrl: 'https://testnet.bscscan.com',
    nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
  },
  998: {
    name: 'Hyperliquid Testnet',
    rpcUrl: 'https://rpc.hyperliquid-testnet.xyz/evm',
    explorerUrl: 'https://explorer.hyperliquid-testnet.xyz',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  },
  59140: {
    name: 'Linea Testnet',
    rpcUrl: 'https://rpc.linea.build',
    explorerUrl: 'https://sepolia.lineascan.build',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  },
  3441005: {
    name: 'Manta Testnet',
    rpcUrl: 'https://manta-testnet.calderachain.xyz/http',
    explorerUrl: 'https://pacific-explorer.testnet.manta.network',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  },
  919: {
    name: 'Mode Testnet',
    rpcUrl: 'https://mode-testnet.drpc.org',
    explorerUrl: 'https://sepolia.explorer.mode.network',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  },
  2710: {
    name: 'Morph Testnet',
    rpcUrl: 'https://rpc-testnet.morphl2.io',
    explorerUrl: 'https://explorer-testnet.morphl2.io',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  },
  10143: {
    name: 'Monad Testnet',
    rpcUrl: 'https://rpc.ankr.com/monad_testnet',
    explorerUrl: 'https://testnet.monadvision.com',
    nativeCurrency: { name: 'Monad', symbol: 'MON', decimals: 18 },
  },
  11155420: {
    name: 'OP Sepolia',
    rpcUrl: 'https://sepolia.optimism.io',
    explorerUrl: 'https://sepolia-optimism.etherscan.io',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  },
  534351: {
    name: 'Scroll Testnet',
    rpcUrl: 'https://sepolia-rpc.scroll.io',
    explorerUrl: 'https://sepolia.scrollscan.com',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  },
  57054: {
    name: 'Sonic Testnet',
    rpcUrl: 'https://rpc.blaze.soniclabs.com',
    explorerUrl: 'https://explorer.blaze.soniclabs.com',
    nativeCurrency: { name: 'Sonic', symbol: 'S', decimals: 18 },
  },
  167009: {
    name: 'Taiko Testnet',
    rpcUrl: 'https://rpc.hekla.taiko.xyz',
    explorerUrl: 'https://explorer.hekla.taiko.xyz',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  },
  11124: {
    name: 'Abstract Testnet',
    rpcUrl: 'https://api.testnet.abs.xyz',
    explorerUrl: 'https://sepolia.abscan.org',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  },
  300: {
    name: 'zkSync Sepolia',
    rpcUrl: 'https://rpc.ankr.com/zksync_era_sepolia',
    explorerUrl: 'https://sepolia.explorer.zksync.io',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  },
  43113: {
    name: 'Avalanche Testnet',
    rpcUrl: 'https://api.avax-test.network/ext/bc/C/rpc',
    explorerUrl: 'https://testnet.snowtrace.io',
    nativeCurrency: { name: 'Avalanche', symbol: 'AVAX', decimals: 18 },
  },
};

// ─── Pre-market contract addresses ───────────────────────────────────────────

export const PRE_MARKET_ADDRESS: Record<number, string> = {
  // Mainnet
  1:        '0x1eCdB32e59e948C010a189a0798C674a2d0c6603',
  42161:    '0x7a560269480Ef38B885526C8bBecdc4686d8bF7A',
  43114:    '0x7a560269480Ef38B885526C8bBecdc4686d8bF7A',
  8453:     '0xdf02eeaB3CdF6eFE6B7cf2EB3a354dCA92A23092',
  80094:    '0x7a560269480Ef38B885526C8bBecdc4686d8bF7A',
  81457:    '0x7a560269480Ef38B885526C8bBecdc4686d8bF7A',
  56:       '0x7a560269480Ef38B885526C8bBecdc4686d8bF7A',
  999:      '0xE2300eC1a92e3ca0Cf91269C28CaDCa58826E72C',
  59144:    '0x7a560269480Ef38B885526C8bBecdc4686d8bF7A',
  169:      '0x231c9BD15657dFa6977A1B8c76737c81e3C61a83',
  4200:     '0x7a560269480Ef38B885526C8bBecdc4686d8bF7A',
  34443:    '0x7a560269480Ef38B885526C8bBecdc4686d8bF7A',
  2818:     '0x7a560269480Ef38B885526C8bBecdc4686d8bF7A',
  143:      '',
  10:       '0xE3b7427C799353cfaDDdc1549967263952f17bd3',
  534352:   '0x7a560269480Ef38B885526C8bBecdc4686d8bF7A',
  146:      '0x7a560269480Ef38B885526C8bBecdc4686d8bF7A',
  167000:   '0x7a560269480Ef38B885526C8bBecdc4686d8bF7A',
  2741:     '0xeFFcBE4711Bc9360F596CA615b3C4003A0d7Ea33',
  324:      '0xE6c5F63623A2aE769dd3D505Bc44D7EB21dd974b',
  // Testnet
  11155111: '0x8B3Beee094d91F90909f01ceBd96F59423Df8025',
  421614:   '0xae9963A611a7c1e5F391375e22a942F4F90bc079',
  84532:    '0xebC47C87C2A91b3e7F3ee9a721249caf2D15aCCb',
  80084:    '0xdca4cC405E50D18e18B5f80AeD975dcB003f8e98',
  168587773:'0xAABcfD1F3df8152F67923365df771Ad7ca1c2940',
  97:       '0xd851C4A1061F8710DBF17490351D6f264ba5D0b8',
  998:      '0xA536765295A4dA2bf1BF8eB5D7EcbAb7737698F7',
  3441005:  '0xae9963A611a7c1e5F391375e22a942F4F90bc079',
  919:      '0x5971Ce70B3d91862a1960E7886F25cb142E4Ae2d',
  2710:     '0x7a560269480Ef38B885526C8bBecdc4686d8bF7A',
  10143:    '0xD5C157e6062c44f086b9600EF1A07DAb7347a718',
  11155420: '0x5971Ce70B3d91862a1960E7886F25cb142E4Ae2d',
  534351:   '0x5971Ce70B3d91862a1960E7886F25cb142E4Ae2d',
  57054:    '0xf5C44572350d2cC1b763db048dA39d111F4e1BeE',
  167009:   '0x5971Ce70B3d91862a1960E7886F25cb142E4Ae2d',
  11124:    '0x513d5bbb56eac9dcd3B47E08567403Df528dFcc8',
  300:      '0x4D084581E6C80dbBa86D29C20b195f4B47ae1fC8',
  43113:    '0x7a560269480Ef38B885526C8bBecdc4686d8bF7A',
};

// ─── OTC pre-market contract addresses ───────────────────────────────────────

export const OTC_PRE_MARKET_ADDRESS: Record<number, string> = {
  // Mainnet
  1:        '0xee8c39e57C23f4024525D21E5Ad0534040B8f901',
  42161:    '0x47D7c164834CcaE520Be78f9Cb032d6d03fDC9bF',
  8453:     '0xd333DFF015508dd26532d5b7b1cD10fF9B622326',
  56:       '0xc99f71424286548b15E5691A8c6f8F156c761A84',
  999:      '0xA875FaCb148a4272A6aa450526Fa8672c364BAB5',
  59144:    '0xEc839588fd671Dc6623419247E394da448C65B23',
  169:      '0x86564f771f6543D0e78C40D989a71D8c65df09A0',
  4200:     '0x6A623D556A98775F977A9e3d1958b3f086d63356',
  80094:    '0xe221C287fAc42a93a29B783CD007A21008E8E465',
  10:       '0x958918e2482230b38f702eaB7c94E248ead09B31',
  146:      '0x1311d574598b516B3B050E77aB9e424867cf9d4D',
  // Testnet
  11155111: '0xF3fBaa59AB30343F12b1abE2C7e8A23E103a1b1a',
  421614:   '0x107381eb073ee8407B179EC2e34F2fd49553baD9',
  84532:    '0x8862b53Dee6dBE8a51169CBDf41937c01DcB5827',
  97:       '0x979f049AeCCd85E41fd0AD1E2Fe2E777776EAA16',
  57054:    '0x1311d574598b516B3B050E77aB9e424867cf9d4D',
};

// ─── Fund distributor contract addresses (referral-enabled chains only) ───────

export const FUND_DISTRIBUTOR_ADDRESS: Record<number, string> = {
  // Mainnet
  1:      '0x86c4F7A49C4bf807d8ce71594fFAF2C56ee34c00',
  42161:  '0xd61a5d617572E611351f922920BBf90A383cec6b',
  8453:   '0x2b204192d39F57f84869A0421Be4C385A5bD3C74',
  56:     '0xf847eD50eC3b795C41c7563Bfe585EA776cA6869',
  59144:  '0xa1EFa627CDC3A06a11F2D5c26257D924981341f2',
  169:    '0x2b88cd6A99E2db51FBa811bFC27E85c8a68b763E',
  4200:   '0x11bA5f89a265d2fC14EB1bE998F08A9c734a25c6',
  80094:  '0x763569c04137ce5954F33aD06941440CE467C2c9',
  10:     '0x33F077f81f6F6aF17388a0C2fd567c4E88fE75eF',
  146:    '0x068DDB8356167158F470365050d967fD1FaF4398',
  999:    '0xbe1FD21be24C64eef05c010Df8f83945403778c9',
  // Testnet
  11155111: '0x8DFb63B5cEc3a0997C9f7C7E1859C63e2dC461cD',
  97:       '0x8339d7Fa5c3c8c4b1b83b57932cDe090331BeB03',
  421614:   '0x2fEe5278e6552aA879137a95F550E7736541C303',
  84532:    '0x272d203412584Cb17B2322d7d883Ae3d27F7085D',
};

// Helper to get the default public RPC URL for a chain ID.
export function getEvmRpcUrl(chainId: number): string {
  return EVM_CHAINS[chainId]?.rpcUrl ?? '';
}
