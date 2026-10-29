import test from 'node:test';
import assert from 'node:assert/strict';
import {nameCopy} from '../src/ui-text';

test('system copy uses name terminology including sentence endings',()=>{
 assert.equal(nameCopy('Domain name is unavailable. Check your domains.'),'Name is unavailable. Check your names.');
 assert.equal(nameCopy('DOMAIN NAMES / My domains'),'NAMES / My names');
});
test('copy preserves names, identifiers and URLs',()=>{
 const text='domain.xah getDomain domain_id owned-domain https://example.com/domain /domains';
 assert.equal(nameCopy(text),text);
});
