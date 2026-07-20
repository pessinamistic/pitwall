---
category: debugging
expects:
  - "/finduserbyid/i"
  - "/undefined|null/i"
  - "/line\s*(6|18)|formatwelcomemessage/i"
  - "/if\s*\(\s*!\s*user|user\s*==\s*null|user\s*===\s*undefined|null check|undefined check/i"
  - "/signup|sendwelcomeemail/i"
---

# Task: find the root cause

A user-signup flow is throwing intermittently in production. Here is the
stack trace and the relevant source file.

```
TypeError: Cannot read properties of undefined (reading 'email')
    at formatWelcomeMessage (app/notify.js:12:24)
    at sendWelcomeEmail (app/notify.js:18:21)
    at async handleSignup (app/routes/signup.js:9:3)
```

`app/notify.js`, numbered:

```
 1  async function findUserById(id) {
 2    const rows = await db.query(
 3      'SELECT * FROM users WHERE id = $1',
 4      [id]
 5    );
 6    return rows[0]; // undefined if no row matched
 7  }
 8
 9  function formatWelcomeMessage(user) {
10    return {
11      subject: 'Welcome!',
12      body: `Hi ${user.email}, thanks for joining.`,
13    };
14  }
15
16  async function sendWelcomeEmail(userId) {
17    const user = await findUserById(userId);
18    const message = formatWelcomeMessage(user);
19    return mailer.send(user.email, message);
20  }
```

`app/routes/signup.js`, relevant excerpt:

```
 7  async function handleSignup(req, res) {
 8    const newUserId = await createUser(req.body);
 9    await sendWelcomeEmail(newUserId);
10    res.status(201).json({ id: newUserId });
11  }
```

It fails "intermittently," not always. Explain the root cause (why `user` is
sometimes undefined at the point `formatWelcomeMessage` reads `user.email`),
identify exactly which line the missing guard belongs on, and propose a fix.

Respond with text only — do not use any tools.
