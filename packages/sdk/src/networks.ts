import {decodeAccountID} from 'xahau';
import {TESTNET} from './deployments';
import type {XahauNameConfig} from './types';

export type NetworkName = 'testnet' | 'mainnet';
/** Blockchain transport only. A name-service deployment is a separate identity. */
export const XAHAU_NETWORKS = Object.freeze({
    testnet: Object.freeze({name: 'testnet', walletKitId: 'xahau-testnet', networkId: 21338,
        wss: 'wss://xahau-test.net', label: 'Xahau Testnet', explorer: 'https://test.xahauexplorer.com/explorer/', faucet: 'https://xahau-test.net/'}),
    mainnet: Object.freeze({name: 'mainnet', walletKitId: 'xahau-mainnet', networkId: 21337,
        wss: 'wss://xahau.network', label: 'Xahau Mainnet', explorer: 'https://explorer.xahau.network/tx/', faucet: null}),
} as const);

export interface NetworkOptions {
    network: NetworkName;
    /** Required on mainnet until a verified mainnet deployment is published. */
    deployment?: Pick<XahauNameConfig, 'treasury' | 'namespaceId' | 'hookHashes' | 'expectedNetworkId'>;
    wss?: string;
}
export function resolveNetworkConfig(options: NetworkOptions): XahauNameConfig {
    if (!Object.hasOwn(XAHAU_NETWORKS, options.network)) throw new Error('Unknown Xahau network');
    const network = XAHAU_NETWORKS[options.network];
    const deployment = options.deployment ?? (options.network === 'testnet' ? TESTNET : undefined);
    if (!deployment) throw new Error('Mainnet deployment is not configured; supply its treasury, namespace and hook hashes');
    if (deployment.expectedNetworkId !== undefined && deployment.expectedNetworkId !== network.networkId)
        throw new Error('Deployment belongs to another network');
    decodeAccountID(deployment.treasury);
    if (!/^[a-f0-9]{64}$/i.test(deployment.namespaceId ?? '')) throw new Error('Deployment namespace is required');
    if (!deployment.hookHashes || Object.keys(deployment.hookHashes).length === 0 ||
        Object.values(deployment.hookHashes).some(h => typeof h !== 'string' || !/^[a-f0-9]{64}$/i.test(h)))
        throw new Error('Deployment hook hashes are required');
    const wss = options.wss ?? network.wss;
    const url = new URL(wss);
    if (!['ws:', 'wss:'].includes(url.protocol)) throw new Error('Use a WebSocket endpoint');
    return {wss, treasury: deployment.treasury, namespaceId: deployment.namespaceId!.toUpperCase(),
        expectedNetworkId: network.networkId,
        hookHashes: Object.fromEntries(Object.entries(deployment.hookHashes).map(([k, v]) => [k, v!.toUpperCase()]))};
}
