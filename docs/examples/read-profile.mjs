import {XahauNameClient, normalizeDomainInput} from '@xahauname/sdk';
import {exampleConfig} from './config.mjs';

// Read-only: no wallet or signer is configured.
const domain = normalizeDomainInput(process.argv[2] ?? 'alice.xah');
const client = new XahauNameClient(exampleConfig());

try {
  await client.connect();
  const ledgerHash = await client.getLedgerHash();
  const options = {ledgerHash};
  const profile = await client.describe(domain, options);
  const owner = profile?.owner ?? null;
  const [receivingAddress, ownedDomains, primary] = await Promise.all([
    client.resolver.resolveAddress(domain, 21337, options),
    owner ? client.listOwnedDomains(owner, options) : [],
    owner ? client.getVerifiedPrimaryName(owner, options) : null,
  ]);
  console.log(JSON.stringify({domain, ledgerHash, owner, profile, receivingAddress, ownedDomains, primary},
    (_key, value) => typeof value === 'bigint' ? value.toString() : value, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  await client.disconnect();
}
