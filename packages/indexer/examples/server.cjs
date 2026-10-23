// Local read-only example. No seed, signing capability or transaction submission.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const {resolveNetworkConfig} = require('@xahauname/sdk');
const {createIndexer, SqliteStorage} = require('../dist');
async function main() {
    const network = process.env.XAHAU_NETWORK || 'testnet';
    const deployment = process.env.XAHAU_DEPLOYMENT_FILE
        ? JSON.parse(fs.readFileSync(process.env.XAHAU_DEPLOYMENT_FILE, 'utf8')) : undefined;
    const config = resolveNetworkConfig({network, deployment, wss: process.env.XAHAU_WSS || undefined});
    const database = process.env.XAHAU_INDEX_DB || path.join(__dirname, '../data', network + '.sqlite');
    fs.mkdirSync(path.dirname(database), {recursive: true});
    const storage = new SqliteStorage(database), indexer = createIndexer({network: config, storage});
    try {
        if (!storage.checkpoint()) {
            if (process.env.XAHAU_INDEX_BOOTSTRAP !== '1') throw new Error('Empty database: set XAHAU_INDEX_BOOTSTRAP=1 to authorize a pinned full-ledger snapshot scan');
            await indexer.bootstrap();
        }
    } catch (e) {await indexer.source.disconnect(); storage.close(); throw e;}
    const abort = new AbortController();
    // Optional snapshot-only mode for offline fixtures or maintenance; status exposes no fresh sync.
    const loop = process.env.XAHAU_INDEX_SYNC === '0' ? Promise.resolve()
        : indexer.start({signal: abort.signal, onError: e => console.error('Indexing paused:', e.message)});
    const sockets = new Set();
    const server = http.createServer((req, res) => {
        try {
            if (req.method !== 'GET') {res.writeHead(405); res.end(); return;}
            const u = new URL(req.url, 'http://localhost');
            const status = indexer.status();
            res.setHeader('Cache-Control', 'no-store');
            if (u.pathname === '/stream') {
                let cursor = Number(req.headers['last-event-id'] || u.searchParams.get('after') || 0);
                indexer.events(cursor, 1); // Validate before sending headers.
                res.writeHead(200, {'Content-Type': 'text/event-stream', 'Connection': 'keep-alive'});
                sockets.add(res);
                const timer = setInterval(() => {
                    const events = indexer.events(cursor, 100);
                    for (const event of events) {cursor = event.cursor; if (!res.write(`id: ${cursor}\ndata: ${JSON.stringify(event)}\n\n`)) {res.end(); return;}}
                    if (!events.length) res.write(': heartbeat\n\n');
                }, 1000);
                res.on('close', () => {clearInterval(timer); sockets.delete(res);}); return;
            }
            let data;
            if (u.pathname === '/status') data = status;
            else if (u.pathname === '/profile') data = indexer.describe(u.searchParams.get('domain') || '');
            else if (u.pathname === '/owned') data = indexer.listOwnedDomains(u.searchParams.get('address') || '');
            else if (u.pathname === '/incoming') data = indexer.listIncomingOffers(u.searchParams.get('address') || '');
            else if (u.pathname === '/primary') data = indexer.getVerifiedPrimaryName(u.searchParams.get('address') || '');
            else if (u.pathname === '/recovery') data = indexer.listRecovery();
            else if (u.pathname === '/events') data = indexer.events(Number(u.searchParams.get('after') || 0), Number(u.searchParams.get('limit') || 100));
            else {res.writeHead(404); res.end(); return;}
            res.writeHead(200, {'Content-Type': 'application/json'}); res.end(JSON.stringify({status, data}));
        } catch (e) {res.writeHead(400, {'Content-Type': 'application/json'}); res.end(JSON.stringify({error: e.message}));}
    });
    const port = Number(process.env.PORT || 8787);
    server.listen(port, '127.0.0.1', () => console.log(`Indexer API: http://127.0.0.1:${server.address().port} (${network})`));
    const stop = async () => {abort.abort(); for (const socket of sockets) socket.end(); server.close(); await loop; storage.close();};
    process.once('SIGINT', stop); process.once('SIGTERM', stop);
}
main().catch(e => {console.error(e.message); process.exitCode = 1;});
