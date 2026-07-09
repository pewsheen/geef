import test from 'node:test';
import assert from 'node:assert/strict';

import { pruneEmptyGroups } from '../src/group-utils.mjs';

test('removes groups that no longer have GIFs', () => {
  const groups = ['Team', 'Work', 'Reactions'];
  const gifs = [
    { group: 'Work' },
    { group: 'Reactions' }
  ];

  assert.deepEqual(pruneEmptyGroups(groups, gifs), ['Reactions', 'Work']);
});

