import {readFileSync} from 'node:fs';
import {resolveNetworkConfig} from '@xahauname/sdk';

/** Public network/deployment settings shared by the read-only examples. */
export function exampleConfig() {
  const network = process.env.XAHAU_NETWORK ?? 'testnet';
  const deployment = process.env.XAHAU_DEPLOYMENT_FILE
    ? JSON.parse(readFileSync(process.env.XAHAU_DEPLOYMENT_FILE, 'utf8'))
    : undefined;
  return resolveNetworkConfig({network, deployment, wss: process.env.XAHAU_WSS || undefined});
}
