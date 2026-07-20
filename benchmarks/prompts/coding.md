---
category: coding
expects:
  - "parseduration"
  - "/function\s+parseDuration|const\s+parseDuration\s*=|parseDuration\s*=\s*function/i"
  - "/throw|error/i"
  - "5400"
  - "/\bd\b.*\bh\b.*\bm\b.*\bs\b|days?.*hours?.*minutes?.*seconds?/is"
---

# Task: implement `parseDuration`

Implement a function `parseDuration(input)` in plain JavaScript (no third-party
dependencies) that converts a duration string into a total number of seconds
(an integer).

Rules:

- Supported unit suffixes, most-significant-first: `d` (days), `h` (hours),
  `m` (minutes), `s` (seconds).
- Units may be combined in one string with no separators and no whitespace,
  e.g. `"1h30m"`, `"2d"`, `"45s"`, `"1h1m5s"`.
- Each unit may appear at most once, and units that do appear must be in the
  order d, h, m, s (skipping any not present).
- If the string is empty, contains an unknown unit, repeats a unit, uses units
  out of order, or has no valid numeric/unit pairs at all, throw an `Error`
  with a descriptive message.
- Return a plain integer number of seconds — no rounding surprises.

Show the complete function, plus one line demonstrating that
`parseDuration("1h30m")` evaluates to `5400`.

Respond with the code and a one-paragraph explanation. Do not use any tools —
just answer in your response text.
