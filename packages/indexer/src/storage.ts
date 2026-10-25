import Database from 'better-sqlite3';
import type {Batch, Checkpoint, Event, Materialized, Storage, Table} from './types';

export function emptyState(): Materialized {
    return {state: Object.create(null), tokens: Object.create(null), domains: Object.create(null), recovery: Object.create(null)};
}
/** One writer per database. WAL readers can consume the persistent outbox independently. */
export class SqliteStorage implements Storage {
    private db: Database.Database;
    constructor(filename: string) {
        this.db = new Database(filename);
        this.db.pragma('journal_mode = WAL'); this.db.pragma('synchronous = FULL');
        this.db.exec(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS projection (kind TEXT NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL, PRIMARY KEY(kind,key));
            CREATE TABLE IF NOT EXISTS ledgers (ledger_index INTEGER PRIMARY KEY, hash TEXT NOT NULL UNIQUE, evidence TEXT);
            CREATE TABLE IF NOT EXISTS receipts (hash TEXT PRIMARY KEY, ledger_index INTEGER NOT NULL, body TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS outbox (cursor INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE, body TEXT NOT NULL);`);
        if(!(this.db.pragma('table_info(ledgers)') as Array<{name:string}>).some(column=>column.name==='evidence'))this.db.exec('ALTER TABLE ledgers ADD COLUMN evidence TEXT');
    }
    bind(identity: string) {
        const bind = this.db.transaction(() => {
            const old = this.db.prepare('SELECT value FROM settings WHERE key=?').get('identity') as {value: string} | undefined;
            if (old && old.value !== identity) throw new Error('Database belongs to a different network/deployment/decoder');
            this.db.prepare('INSERT OR IGNORE INTO settings VALUES (?,?)').run('identity', identity);
        }); bind();
    }
    checkpoint(): Checkpoint | null {
        const row = this.db.prepare('SELECT ledger_index,hash FROM ledgers ORDER BY ledger_index DESC LIMIT 1').get() as {ledger_index: number; hash: string} | undefined;
        return row ? {ledgerIndex: row.ledger_index, ledgerHash: row.hash} : null;
    }
    load(): Materialized {
        const out = emptyState();
        for (const row of this.db.prepare('SELECT kind,key,value FROM projection').iterate() as Iterable<{kind: Table; key: string; value: string}>)
            out[row.kind][row.key] = JSON.parse(row.value);
        return out;
    }
    commit(batch: Batch) {
        this.db.transaction(() => {
            const current = this.checkpoint();
            if (current && batch.checkpoint.ledgerIndex !== current.ledgerIndex + 1) throw new Error('Non-contiguous checkpoint');
            const put = this.db.prepare('INSERT INTO projection VALUES (?,?,?) ON CONFLICT(kind,key) DO UPDATE SET value=excluded.value');
            const remove = this.db.prepare('DELETE FROM projection WHERE kind=? AND key=?');
            for (const change of batch.changes) {
                if (change.value === null) remove.run(change.table, change.key);
                else put.run(change.table, change.key, JSON.stringify(change.value));
            }
            const raw = this.db.prepare('INSERT INTO receipts VALUES (?,?,?)');
            for (const r of batch.receipts) raw.run(r.hash, r.ledgerIndex, JSON.stringify(r));
            const event = this.db.prepare('INSERT INTO outbox(id,body) VALUES (?,?)');
            for (const e of batch.events) event.run(e.id, JSON.stringify(e));
            this.db.prepare('INSERT INTO ledgers(ledger_index,hash,evidence) VALUES (?,?,?)').run(batch.checkpoint.ledgerIndex, batch.checkpoint.ledgerHash,batch.ledgerEvidence?JSON.stringify(batch.ledgerEvidence):null);
        })();
    }
    events(after = 0, limit = 100): Array<Event & {cursor: number}> {
        if (!Number.isSafeInteger(after) || after < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 1000) throw new Error('Invalid outbox pagination');
        return (this.db.prepare('SELECT cursor,body FROM outbox WHERE cursor>? ORDER BY cursor LIMIT ?').all(after, limit) as {cursor: number; body: string}[])
            .map(row => ({...JSON.parse(row.body), cursor: row.cursor}));
    }
    close() {this.db.close();}
}
