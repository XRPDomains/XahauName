import { XahauNameError } from './errors';
import type { SetRoleArgs, TxResult } from './types';
/** Native-v2 deployment uses treasury-only administration. */
export class TreasuryModule {
    async setRole(_args: SetRoleArgs): Promise<TxResult> {
        throw new XahauNameError('setRole is unsupported by native-v2 hooks', 'UNSUPPORTED_OPERATION');
    }
}
