# Feature Plan: View Staff Password (Admin)

## What the Client is Requesting

When Admin opens the **Edit Staff** dialog, the Password field currently shows `••••••••` (masked placeholder). The admin wants to be able to click an eye icon to reveal the staff member's actual login password.

---

## Why It Can't Just Be "Decoded"

Passwords are currently stored using **bcrypt** — a one-way hashing algorithm. This means:

- The original password **cannot be recovered** from what is stored in the database.
- This is standard security practice — even the system itself doesn't know the password after it is set.

To support the "view password" feature, the system must be **changed** to also store a second, reversible copy of the password.

---

## Proposed Solution

Store a **Fernet-encrypted** (AES symmetric encryption) copy of the password alongside the existing bcrypt hash.

- The **bcrypt hash** continues to be used for login — no change to how login works.
- The **Fernet-encrypted copy** is stored separately and can be decrypted by the server when the admin requests it.
- Only the **Admin role** can call the reveal endpoint — other users cannot see it.

---

## What Needs to Change

| Area | Change |
|---|---|
| Database | Add a new column `password_plain` (encrypted) to the staff table |
| Backend | Encrypt password on create/update; new admin-only API endpoint to reveal it |
| Server config | Add a secret encryption key (`FERNET_KEY`) to the server environment |
| Frontend | Add eye icon to the Password field in Edit Staff dialog |

---

## Important Limitations

1. **Existing staff passwords cannot be revealed** — any password set before this feature is deployed was stored as bcrypt only (no reversible copy). Those staff members would need to have their password reset to populate the encrypted copy.

2. **If the encryption key is lost**, all stored `password_plain` values become unreadable permanently — staff passwords would need to be reset.

3. **This is a deliberate trade-off** — storing reversible passwords, even encrypted, is less secure than pure bcrypt. It is acceptable for an internal admin tool but should be understood by the client.

---

## Questions for Client

1. Is this feature needed for **all users** or **Admin only**?
2. Is the client okay with the limitation that **existing staff passwords cannot be revealed** (they'd need a reset)?
3. Should this same feature apply to **Drivers** as well, or only Staff?

---

## Effort Estimate

Small — approximately 2–3 hours of development once client confirms the above questions.
