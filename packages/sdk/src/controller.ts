import { tldKey } from './util';
import { parameters, invalid } from './protocol';
import type { ClientContext } from './context';
import { XahauNameError } from './errors';
import type {ReadOptions} from './types';
export class ControllerModule {
    constructor(private ctx: ClientContext, private hardcodedTlds: readonly string[]) {
    }
    async hasRole(role: string, address: string): Promise<boolean> {
        return role.toLowerCase() === 'admin' && address === this.ctx.treasury;
    }
    async isTldEnabled(tld: string,options?:ReadOptions): Promise<boolean> {
        const lower = tld.toLowerCase(), buf = await this.ctx.readState(tldKey(lower),options);
        return buf ? buf[0] === 1 : this.hardcodedTlds.includes(lower);
    }
    listTlds(extraKnown: string[] = []): string[] {
        return [...new Set([...this.hardcodedTlds, ...extraKnown.map(t => t.toLowerCase())])];
    }
    private invoke(op: 'addTld' | 'removeTld' | 'pause' | 'unpause', fields: Record<string, Buffer> = {}) {
        const signer = this.ctx.signerAddress();
        if (!signer)
            throw new XahauNameError('Signer required', 'NO_SIGNER');
        if (signer !== this.ctx.treasury)
            throw new XahauNameError('Treasury owner required', 'NOT_ADMIN');
        return this.ctx.submit({ TransactionType: 'Invoke', HookParameters: parameters(op, fields) }, { handler: 'admin', returns: [op === 'pause' || op === 'unpause' ? 'pause toggled' : 'tld updated'] });
    }
    addTld(tld: string) {
        if (!/^[a-z0-9]{2,8}$/i.test(tld))
            invalid('Invalid TLD');
        return this.invoke('addTld', { tld: Buffer.from(tld.toLowerCase()) });
    }
    removeTld(tld: string) {
        if (!/^[a-z0-9]{2,8}$/i.test(tld))
            invalid('Invalid TLD');
        return this.invoke('removeTld', { tld: Buffer.from(tld.toLowerCase()) });
    }
    pause() {
        return this.invoke('pause');
    }
    unpause() {
        return this.invoke('unpause');
    }
}
