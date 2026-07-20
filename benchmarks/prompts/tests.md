---
category: tests
expects:
  - "chunkarray"
  - "/empty array|\[\]/i"
  - "/size\s*(<=?\s*0|of\s*0|negative)|non-integer|invalid size/i"
  - "/describe\(|test\(|it\(/i"
  - "/larger than|exceeds|greater than.*length/i"
---

# Task: write unit tests

Here is a function. Write unit tests for it, using either Jest-style syntax
(`describe`/`it`/`expect`) or Node's built-in `node:test` module — either is
fine, just pick one and be consistent.

```js
function chunkArray(array, size) {
  if (!Number.isInteger(size) || size <= 0) {
    throw new Error('size must be a positive integer');
  }
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}
```

Your tests must cover, at minimum, these edge cases:

- A normal case where the array length is an exact multiple of `size`.
- A normal case where it is not (the last chunk is smaller).
- An empty input array.
- `size` larger than the array length (should produce one chunk).
- Invalid `size`: zero, negative, and non-integer, all of which should throw.

Respond with the test code and a short list of which edge cases you covered.
Do not use any tools — just answer in your response text.
