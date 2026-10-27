// Self-check for the Worker's pure helpers. Usage: node worker/test.mjs
import assert from 'node:assert/strict';
import { parseScore, taipeiDay, CARD_IDS } from './index.mjs';

assert.deepEqual(CARD_IDS, ['1', '2', '3', '4-1', '4-2', '5', '6']);
// 2026-10-29 16:30 UTC is already 10-30 in Taipei
assert.equal(taipeiDay(Date.UTC(2026, 9, 29, 16, 30)), '2026-10-30');
assert.equal(taipeiDay(Date.UTC(2026, 9, 29, 15, 59)), '2026-10-29');

const good = { grp: 3, seat: 12, card: '4-1', stars: 2, overall: 74.6, accuracy: 80, fluency: null, completeness: 100, prosody: 70.2, weak: ['whisk'], attempts: 2 };
assert.deepEqual(parseScore(good), { value: { grp: 3, seat: 12, card: '4-1', stars: 2, overall: 75, attempts: 2, accuracy: 80, fluency: null, completeness: 100, prosody: 70, weak: ['whisk'] } });
assert.deepEqual(parseScore({ ...good, weak: undefined }).value.weak, []);

const bad = (patch, field) => assert.deepEqual(parseScore({ ...good, ...patch }), { error: field }, JSON.stringify(patch));
bad({ seat: 41 }, 'seat');
bad({ seat: '12' }, 'seat');
bad({ grp: 0 }, 'grp');
bad({ card: '7' }, 'card');
bad({ stars: 4 }, 'stars');
bad({ overall: -1 }, 'overall');
bad({ attempts: 4 }, 'attempts');
bad({ accuracy: 101 }, 'accuracy');
bad({ prosody: NaN }, 'prosody');
bad({ weak: 'whisk' }, 'weak');
bad({ weak: Array(11).fill('a') }, 'weak');
bad({ weak: ['x'.repeat(31)] }, 'weak');
bad({ weak: [''] }, 'weak');
assert.deepEqual(parseScore(null), { error: 'body' });
assert.deepEqual(parseScore([]), { error: 'body' });

console.log('worker: all checks passed');
