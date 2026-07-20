---
category: reviewing
expects:
  - "/off.?by.?one|out.of.bounds|items\.length\s*\]|undefined/i"
  - "/discountpercent\s*=\s*0|assignment|=(?!=)=?\s*0.*(?:instead of|should be)|===/i"
  - "/math\.floor|round(?:ing)?|truncat/i"
  - "/\b3\b|three/i"
  - "/line\s*(4|5|9|10|12|13)/i"
---

# Task: review this diff for bugs

The diff below was submitted for `cart.js`, a shopping-cart total calculator.
It contains **exactly three bugs** that were introduced by this change (not
pre-existing issues). Find all three, explain the runtime effect of each, and
propose a one-line fix for each. Reference line numbers from the "after"
version shown below the diff.

```diff
--- a/cart.js
+++ b/cart.js
@@ -1,15 +1,15 @@
 function calculateTotal(items, discountPercent) {
   let total = 0;
-  for (let i = 0; i < items.length; i++) {
+  for (let i = 0; i <= items.length; i++) {
     total += items[i].price * items[i].quantity;
   }
 
-  if (discountPercent > 0) {
+  if (discountPercent = 0) {
     total = total - (total * discountPercent / 100);
   }
 
-  return Math.round(total * 100) / 100;
+  return Math.floor(total * 100) / 100;
 }
```

Full file after the change, numbered for reference:

```
 1  function calculateTotal(items, discountPercent) {
 2    let total = 0;
 3
 4    for (let i = 0; i <= items.length; i++) {
 5      total += items[i].price * items[i].quantity;
 6    }
 7
 8    if (discountPercent = 0) {
 9      total = total - (total * discountPercent / 100);
10    }
11
12    return Math.floor(total * 100) / 100;
13  }
```

List each of the three bugs separately with the line number it lives on.
Respond with text only — do not use any tools.
