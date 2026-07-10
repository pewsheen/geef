import test from 'node:test';
import assert from 'node:assert/strict';

import { cleanGroupName, normalizeGroups, pruneEmptyGroups } from '../src/group-utils.mjs';

test('removes groups that no longer have GIFs', () => {
  const groups = ['Team', 'Work', 'Reactions'];
  const gifs = [
    { group: 'Work' },
    { group: 'Reactions' }
  ];

  assert.deepEqual(pruneEmptyGroups(groups, gifs), ['Reactions', 'Work']);
});

test('normalizes group input before it is persisted', () => {
  assert.deepEqual(
    normalizeGroups([' Work ', 'Team', 'Work', '', null]),
    ['Team', 'Work']
  );
  assert.equal(cleanGroupName(123), '123');
});

test('keeps reserved labels out of a pruned group list', () => {
  const groups = ['All', 'Favorites', 'Work'];
  const gifs = [{ group: 'Work' }, { group: 'All' }];

  assert.deepEqual(
    pruneEmptyGroups(groups, gifs, { reservedLabels: ['all', 'favorites'] }),
    ['Work']
  );
});
