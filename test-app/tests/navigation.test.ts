import test from 'node:test';
import assert from 'node:assert/strict';
import {connectedWalletView,parseRoute,routeHash,type AppRoute} from '../src/navigation';

test('connecting from the empty discovery screen opens the wallet collection',()=>{
 assert.equal(connectedWalletView('discover',false),'portfolio');
 assert.equal(connectedWalletView('portfolio',false),'portfolio');
});
test('wallet connection preserves a discovery draft, quote or interrupted checkout',()=>{
 assert.equal(connectedWalletView('discover',true),'discover');
});
test('connecting while reading a public profile keeps the profile open',()=>{
 assert.equal(connectedWalletView('profile-section',false),'profile-section');
 assert.equal(connectedWalletView('profile-section',true),'profile-section');
});
test('shareable routes round-trip screens and profile sections under any hosting base',()=>{
 const routes:AppRoute[]=[{view:'discover'},{view:'discover',section:'lookup'},{view:'portfolio'},{view:'portfolio',section:'claims'},{view:'profile-section',name:'alice.xah'},...(['addresses','profile','records','settings'] as const).map(section=>({view:'profile-section' as const,name:'alice.xah',section}))];
 for(const route of routes){const url=new URL(routeHash(route),'https://example.com/xahauname/');assert.equal(url.pathname,'/xahauname/');assert.deepEqual(parseRoute(url.hash),route);}
 for(const hash of ['#/name/%ZZ','#/name/%3Cscript%3E.xah','#/name/alice.xah/unknown','#/name/a/b.xah','#/name/Alice.xah'])assert.equal(parseRoute(hash),null);
 assert.deepEqual(parseRoute(''),{view:'discover'});
});
