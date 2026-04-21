# Tests

Hand-rolled test harness with zero dependencies. Runs in Node directly.

## Running

```bash
node tests/run.js
```

The runner exits with code 0 on all-pass, nonzero on any failure.

## Writing tests

Create a `*.test.js` file in this directory. Export a `tests` object mapping
descriptive names to sync-or-async functions. Each test throws on failure
(use helpers from `./helpers.js`).

```js
import {assertEqual} from './helpers.js';
import {myFunction} from '../js/my-module.js';

export const tests = {
    'does the right thing'() {
        assertEqual(myFunction(2, 3), 5);
    },

    async 'handles async input'() {
        const result = await myFunction(promise);
        assertEqual(result, 'ok');
    },
};
```

## Scope

Current tests cover pure functions only. DOM-dependent code (rendering,
event handlers, modals) is not tested — that will come when we migrate to
Vitest (likely at v0.5.x when async work lands).

## Helpers

- `assertEqual(actual, expected, msg?)` — strict `===`
- `assertDeepEqual(actual, expected, msg?)` — JSON-serialized comparison
- `assertTrue(value, msg?)` / `assertFalse(value, msg?)`
- `assertThrows(fn, messageMatch?, msg?)` — expects `fn()` to throw
- `assertApprox(actual, expected, epsilon?, msg?)` — for floats
