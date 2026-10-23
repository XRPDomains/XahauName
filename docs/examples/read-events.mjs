import {IndexerReadClient} from '@xahauname/sdk';
import {exampleConfig} from './config.mjs';

// Read one event page. Persist the returned cursor after processing it.
const after = Number(process.argv[2] ?? '0');
try {
  if (!Number.isSafeInteger(after) || after < 0) throw new Error('Cursor must be a nonnegative integer');
  const config = exampleConfig();
  const reader = new IndexerReadClient({
    url: process.env.XAHAU_INDEXER_URL ?? 'http://127.0.0.1:8787',
    networkId: config.expectedNetworkId,
  });
  const result = await reader.events(after, 100, AbortSignal.timeout(15000));
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
