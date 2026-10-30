import {test} from 'node:test'; import assert from 'node:assert/strict'; import {meetUrl} from './url';
test('canonicalizes both Meet formats',()=>{assert.equal(meetUrl('https://meet.google.com/meet/abc-defg-hij'),'https://meet.google.com/abc-defg-hij');});
test('rejects arbitrary and credentialed destinations',()=>{for(const u of ['http://meet.google.com/abc-defg-hij','https://localhost/abc-defg-hij','https://user@meet.google.com/abc-defg-hij','https://meet.google.com.evil.test/abc-defg-hij']) assert.throws(()=>meetUrl(u));});
