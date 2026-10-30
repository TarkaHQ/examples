import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Page } from 'playwright';
import { assertGoogleJoinPage, GoogleJoinError, publicJoinError } from '../vendor/vexa/googlemeet/join-failure';
import { waitForAnySelector, waitForLobbyCta } from '../vendor/vexa/googlemeet/join';
import { finishEmptySpool } from './empty-spool';

function page(url: string, rejected = false): Page {
  return {
    url: () => url,
    getByText: () => ({ first: () => ({ isVisible: async () => rejected }) }),
    locator: () => { throw new Error('Must not inspect a name field or click target after rejection'); },
  } as unknown as Page;
}

test('both join polls stop at the observed Google rejection before selecting any field', async () => {
  const rejected = page('https://meet.google.com/meet/abc-defg-hij?hl=en', true);
  for (const poll of [waitForAnySelector, waitForLobbyCta]) {
    await assert.rejects(poll(rejected, ['input[type=text]'], 1000, 'name'),
      (e: GoogleJoinError) => e.code === 'google_rejected');
  }
});

test('redirected marketing forms and authentication or consent gates never become join targets', async () => {
  for (const [url, code] of [
    ['https://workspace.google.com/products/meet/', 'left_meeting'],
    ['https://meet.google.com/', 'left_meeting'],
    ['https://accounts.google.com/signin', 'sign_in_required'],
    ['https://consent.google.com/', 'consent_required'],
    ['https://meet.google.com.evil.test/abc-defg-hij', 'left_meeting'],
  ]) await assert.rejects(assertGoogleJoinPage(page(url)), (e: GoogleJoinError) => e.code === code);
});

test('both supported meeting URL shapes remain eligible while Google prepares the lobby', async () => {
  for (const url of ['https://meet.google.com/abc-defg-hij', 'https://meet.google.com/meet/abc-defg-hij?hl=en']) {
    await assertGoogleJoinPage(page(url));
  }
});

test('only fixed known errors reach the user', () => {
  assert.match(publicJoinError(new GoogleJoinError('google_rejected')), /before admission/);
  assert.doesNotMatch(publicJoinError(new Error('private page text https://example.invalid/secret')), /private|secret|https/);
});

test('empty spool cleanup reports interruption without reopening a failed recording', async () => {
  const calls: string[] = [];
  assert.equal(await finishEmptySpool([], async () => { calls.push('state'); }, async () => { calls.push('remove'); }), true);
  assert.deepEqual(calls, ['state', 'remove']);
  calls.length = 0;
  assert.equal(await finishEmptySpool(['000000.wav'], async () => { calls.push('state'); }, async () => { calls.push('remove'); }), false);
  assert.deepEqual(calls, []);
});
