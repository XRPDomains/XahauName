export const NETWORKS = [
    {coin:21337,symbol:'XAH',name:'Xahau',placeholder:'r...'},
    {coin:144,symbol:'XRP',name:'XRP Ledger',placeholder:'r... or X...'},
    {coin:0,symbol:'BTC',name:'Bitcoin',placeholder:'bc1… or 1…'},
    {coin:60,symbol:'ETH',name:'Ethereum',placeholder:'0x…'},
    {coin:501,symbol:'SOL',name:'Solana',placeholder:'Base58 Solana address'},
    {coin:195,symbol:'TRX',name:'TRON',placeholder:'T…'},
] as const;
export {encodeAddress,decodeAddress} from '../../packages/sdk/src/addresses';
export function networkName(coin:number){return NETWORKS.find(n=>n.coin===coin)?.name??(coin===345?'Legacy SOL record (345)':coin===535?'Legacy Xahau record (535)':`Custom coin ${coin}`);}
export {GLOBAL_PROFILE_FIELDS as PROFILE_FIELDS} from '../../packages/sdk/src/text-records';
