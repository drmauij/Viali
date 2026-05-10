# Surgeon Portal — Account Menu + My Data Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the surgeon portal's inline language switch + standalone logout button with a single account dropdown anchored on an avatar with initials, and add an "Edit profile" modal that lets the surgeon update their own firstName / lastName / phone (email stays read-only as the OTP login key).

**Architecture:** The dropdown wraps the existing language and logout handlers — no new behavior on either, just visual consolidation following the main app's `TopBar` pattern. The "Edit profile" modal is a small local component inside `SurgeonPortal.tsx` containing a controlled form that PATCHes `/api/surgeon-portal/:token/me`. Server-side validation uses Zod with `.strict()` to reject unknown keys (defense-in-depth against email-change attempts).

**Tech Stack:** React + TypeScript, Radix DropdownMenu + Dialog (already in project), TanStack Query, Drizzle, Zod, Vitest + supertest. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-05-10-surgeon-portal-account-menu-design.md`

---

## File map

- **Modify** `client/src/components/surgery/SurgeryRequestForm.tsx` — export `surgeonInitials` so the page header can render the same avatar initials.
- **Modify** `server/routes/surgeonPortal.ts` — new `PATCH /api/surgeon-portal/:token/me` route.
- **Modify** `client/src/pages/SurgeonPortal.tsx` — add 6 i18n keys, replace inline language+logout with `<AccountMenu>`, add `<MyDataDialog>` modal.
- **Modify** `tests/surgeon-praxis-routes.test.ts` — new `describe("PATCH /me")` block.

No new files. No DB migration.

---

## Task 1: Add 6 i18n keys

**Files:**
- Modify: `client/src/pages/SurgeonPortal.tsx`

Add the six keys to both DE and EN dictionaries up front so subsequent tasks can reference them.

- [ ] **Step 1: Add 6 keys to the `de` dictionary**

Open `client/src/pages/SurgeonPortal.tsx`. Find the `de` dictionary block. Insert before its closing `}`:

```ts
    // Account menu + My Data
    "accountMenu.editProfile": "Profil bearbeiten",
    "myData.title": "Meine Daten",
    "myData.emailHint": "Wird zur Anmeldung verwendet — kann nicht geändert werden",
    "myData.cancel": "Abbrechen",
    "myData.save": "Speichern",
    "myData.saveSuccess": "Profil aktualisiert",
    "myData.saveFailed": "Aktualisierung fehlgeschlagen",
```

- [ ] **Step 2: Add the same 7 keys (6 spec + saveFailed) to the `en` dictionary**

Find the `en` block. Insert before its closing `}`:

```ts
    // Account menu + My Data
    "accountMenu.editProfile": "Edit profile",
    "myData.title": "My Data",
    "myData.emailHint": "Used to log in — cannot be changed",
    "myData.cancel": "Cancel",
    "myData.save": "Save changes",
    "myData.saveSuccess": "Profile updated",
    "myData.saveFailed": "Update failed",
```

- [ ] **Step 3: Run typecheck**

Run: `npm run check`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/SurgeonPortal.tsx
git commit -m "$(cat <<'EOF'
feat(surgeon-portal): add account menu + my data i18n keys

Adds 7 translation keys (DE + EN) for the upcoming account
dropdown (1 key) and the My Data modal (6 keys: title, email
hint, Cancel/Save labels, success/failure toast text).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Export `surgeonInitials` from the form module

**Files:**
- Modify: `client/src/components/surgery/SurgeryRequestForm.tsx`

The Phase 1 helper `surgeonInitials(firstName, lastName)` lives in the form module. The new account-menu avatar needs the same initials logic. Export it.

- [ ] **Step 1: Change the helper from internal `function` to an exported `function`**

Open `/home/mau/viali/client/src/components/surgery/SurgeryRequestForm.tsx`. Find the `surgeonInitials` declaration (currently `function surgeonInitials(...)`). Change the leading keyword:

Before:
```ts
function surgeonInitials(firstName: string | null, lastName: string | null): string {
```

After:
```ts
export function surgeonInitials(firstName: string | null, lastName: string | null): string {
```

- [ ] **Step 2: Run typecheck**

Run: `npm run check`
Expected: PASS.

- [ ] **Step 3: Run all form tests to confirm no regression**

Run: `npx vitest run tests/surgery-request-form.test.tsx`
Expected: 17/17 PASS.

- [ ] **Step 4: Commit**

```bash
git add client/src/components/surgery/SurgeryRequestForm.tsx
git commit -m "$(cat <<'EOF'
refactor(surgery-request): export surgeonInitials helper

The Phase 1 helper that produces "BM" / "—" initials from a
surgeon's first + last name is reused by the upcoming account-
menu avatar in SurgeonPortal. No behavior change — only visibility.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Backend PATCH `/api/surgeon-portal/:token/me`

**Files:**
- Modify: `server/routes/surgeonPortal.ts` — new PATCH route, ~30 lines.
- Modify: `tests/surgeon-praxis-routes.test.ts` — new describe block with 4 tests.

### Step 1: Add the failing tests

Append to `/home/mau/viali/tests/surgeon-praxis-routes.test.ts`. Reuse the file's existing setup helpers (it already has `praxisUser`, `childUser`, `soloUser`, the express app, and a helper that creates a session cookie). Find the existing test file's pattern for issuing an authenticated request — most likely `request(app).post(...).set("Cookie", ...)`.

```ts
describe("PATCH /api/surgeon-portal/:token/requests-deferred-to-me", () => {
  // Wrapper around the file's existing session helper. If the file already
  // exposes one via a different name, adapt these calls; do NOT change the
  // session-creation logic.
  const sessionCookieFor = (email: string) =>
    // Use whatever helper this file already uses to create a portal session.
    // Look near the existing POST /requests tests to find it.
    (globalThis as any).__createPortalSession?.(email) ?? "";
});

describe("PATCH /api/surgeon-portal/:token/me", () => {
  it("solo doctor updates own first/last/phone", async () => {
    const cookie = await createPortalSessionCookie(soloUser.email);
    const res = await request(app)
      .patch(`/api/surgeon-portal/${portalToken}/me`)
      .set("Cookie", cookie)
      .send({ firstName: "NewFirst", lastName: "NewLast", phone: "+41 79 999 99 99" });
    expect(res.status).toBe(200);
    expect(res.body.firstName).toBe("NewFirst");
    expect(res.body.lastName).toBe("NewLast");
    expect(res.body.phone).toBe("+41 79 999 99 99");
    expect(res.body.email).toBe(soloUser.email);

    // Verify db
    const [row] = await db.select().from(users).where(eq(users.id, soloUser.id));
    expect(row.firstName).toBe("NewFirst");
    expect(row.lastName).toBe("NewLast");
    expect(row.phone).toBe("+41 79 999 99 99");
  });

  it("rejects empty firstName with 400", async () => {
    const cookie = await createPortalSessionCookie(soloUser.email);
    const res = await request(app)
      .patch(`/api/surgeon-portal/${portalToken}/me`)
      .set("Cookie", cookie)
      .send({ firstName: "", lastName: "Still", phone: null });
    expect(res.status).toBe(400);
  });

  it("rejects unknown keys (e.g. email change attempt)", async () => {
    const beforeEmail = soloUser.email;
    const cookie = await createPortalSessionCookie(soloUser.email);
    const res = await request(app)
      .patch(`/api/surgeon-portal/${portalToken}/me`)
      .set("Cookie", cookie)
      .send({
        firstName: "Still",
        lastName: "Same",
        phone: null,
        email: "evil@example.com",
      });
    expect(res.status).toBe(400);

    // Confirm db email unchanged
    const [row] = await db.select().from(users).where(eq(users.id, soloUser.id));
    expect(row.email).toBe(beforeEmail);
  });

  it("normalizes empty phone string to null", async () => {
    const cookie = await createPortalSessionCookie(soloUser.email);
    const res = await request(app)
      .patch(`/api/surgeon-portal/${portalToken}/me`)
      .set("Cookie", cookie)
      .send({ firstName: "First", lastName: "Last", phone: "" });
    expect(res.status).toBe(200);
    expect(res.body.phone).toBeNull();
  });
});
```

**Note about `createPortalSessionCookie`:** the test file already authenticates each test via some helper (look near the existing `POST /requests` tests to find it). Reuse THAT helper — do not invent a new one. If the existing helper takes different args, adapt the calls above to match.

The first describe block placeholder above is intentionally a no-op; delete it and just keep the second `describe("PATCH /api/surgeon-portal/:token/me")`.

### Step 2: Run the tests — confirm they fail

Run: `npx vitest run tests/surgeon-praxis-routes.test.ts -t "PATCH"`
Expected: FAIL — route doesn't exist (404 responses).

### Step 3: Add the PATCH route

Open `/home/mau/viali/server/routes/surgeonPortal.ts`. Find the existing `GET /api/surgeon-portal/:token/me` route (around line 558). Add the import for `z` from zod at the top of the file if not already present:

```ts
import { z } from "zod";
```

Add the new route immediately AFTER the existing `GET /me`:

```ts
const updateMeSchema = z
  .object({
    firstName: z.string().trim().min(1, "firstName cannot be empty").max(120),
    lastName: z.string().trim().min(1, "lastName cannot be empty").max(120),
    phone: z.union([z.string().trim().max(40), z.null()]),
  })
  .strict();

router.patch(
  "/api/surgeon-portal/:token/me",
  requireSurgeonSession,
  async (req: Request, res: Response) => {
    try {
      const parsed = updateMeSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          message: "Invalid payload",
          errors: parsed.error.flatten(),
        });
      }
      const email = ((req as any).surgeonEmail as string).toLowerCase();
      const phoneNormalized =
        parsed.data.phone === "" ? null : parsed.data.phone;

      const [updated] = await db
        .update(users)
        .set({
          firstName: parsed.data.firstName,
          lastName: parsed.data.lastName,
          phone: phoneNormalized,
          updatedAt: new Date(),
        })
        .where(sql`LOWER(${users.email}) = ${email}`)
        .returning();

      if (!updated) return res.status(404).json({ message: "Not found" });

      res.json({
        id: updated.id,
        firstName: updated.firstName,
        lastName: updated.lastName,
        email: updated.email,
        phone: updated.phone,
        isPraxis: updated.isPraxis,
      });
    } catch (error) {
      logger.error("Error in PATCH /me:", error);
      res.status(500).json({ message: "Failed" });
    }
  },
);
```

### Step 4: Run the tests — confirm they pass

Run: `npx vitest run tests/surgeon-praxis-routes.test.ts -t "PATCH"`
Expected: 4/4 PASS.

### Step 5: Run full surgeon-praxis test suite + typecheck

Run: `npx vitest run tests/surgeon-praxis-routes.test.ts`
Run: `npm run check`
Expected: all PASS.

### Step 6: Commit

```bash
git add server/routes/surgeonPortal.ts tests/surgeon-praxis-routes.test.ts
git commit -m "$(cat <<'EOF'
feat(surgeon-portal): PATCH /me for editable profile fields

New endpoint accepts firstName, lastName, phone — all the rest of
the user row is left untouched. Zod schema is .strict(), so
unknown keys (including email) trigger a 400 instead of being
silently ignored. Empty-string phone is normalized to null.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Account dropdown

**Files:**
- Modify: `client/src/pages/SurgeonPortal.tsx`

Replace the existing inline `[Globe + DE EN buttons] [Logout icon]` cluster with a single avatar trigger that opens a Radix DropdownMenu.

### Step 1: Add the imports

Open `/home/mau/viali/client/src/pages/SurgeonPortal.tsx`. Add new imports near the existing UI component imports:

```ts
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Pencil } from "lucide-react";
import { surgeonInitials } from "@/components/surgery/SurgeryRequestForm";
```

`Globe` and `LogOut` may still be needed if used elsewhere — confirm by grep. The `Globe` import was used only by the inline language buttons; if no other use remains, remove it. `LogOut` was used only by the standalone logout button; remove if unused after this change.

### Step 2: Locate the existing inline header cluster

Find the JSX that renders the language buttons + logout. It looks like:

```tsx
<div className="flex items-center gap-2">
  <div className="flex gap-1">
    <Globe className="h-4 w-4 text-muted-foreground mt-1.5 mr-1" />
    {["de", "en"].map((l) => (
      <Button
        key={l}
        variant={l === lang ? "default" : "ghost"}
        size="sm"
        className="px-2 py-1 h-7 text-xs"
        onClick={() => switchLang(l)}
      >
        {LANGUAGE_LABELS[l]}
      </Button>
    ))}
  </div>
  <Button
    variant="ghost"
    size="sm"
    className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
    onClick={async () => {
      try {
        await fetch(`/api/surgeon-portal/${token}/logout`, { method: "POST" });
      } catch {
        // proceed with reload regardless
      }
      window.location.reload();
    }}
    title={t.logout}
  >
    <LogOut className="h-4 w-4" />
  </Button>
</div>
```

### Step 3: Add a state hook for the modal

Just below the other `useState` hooks at the top of the component, add:

```ts
const [myDataOpen, setMyDataOpen] = useState(false);
```

### Step 4: Replace the inline cluster with the dropdown

Replace the entire inline `<div className="flex items-center gap-2">...</div>` block (the one containing the language buttons + logout) with:

```tsx
<DropdownMenu>
  <DropdownMenuTrigger asChild>
    <button
      type="button"
      className="w-9 h-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-semibold hover:opacity-90 transition-opacity"
      data-testid="account-menu-trigger"
    >
      {surgeonInitials(me?.firstName ?? null, me?.lastName ?? null)}
    </button>
  </DropdownMenuTrigger>
  <DropdownMenuContent align="end" className="w-56">
    <DropdownMenuLabel className="font-normal">
      <div className="font-medium leading-tight">
        {[me?.firstName, me?.lastName].filter(Boolean).join(" ") || "—"}
      </div>
      <div className="text-xs text-muted-foreground truncate">
        {me?.email ?? ""}
      </div>
    </DropdownMenuLabel>
    <DropdownMenuSeparator />
    <DropdownMenuItem
      onSelect={() => setMyDataOpen(true)}
      data-testid="menu-item-edit-profile"
    >
      <Pencil className="h-4 w-4 mr-2" />
      {tFn("accountMenu.editProfile")}
    </DropdownMenuItem>
    <DropdownMenuItem
      onSelect={() => switchLang(lang === "de" ? "en" : "de")}
      data-testid="menu-item-toggle-language"
    >
      <Globe className="h-4 w-4 mr-2" />
      {lang === "de" ? "English" : "Deutsch"}
    </DropdownMenuItem>
    <DropdownMenuSeparator />
    <DropdownMenuItem
      className="text-destructive focus:text-destructive"
      onSelect={async () => {
        try {
          await fetch(`/api/surgeon-portal/${token}/logout`, { method: "POST" });
        } catch {
          // proceed with reload regardless
        }
        window.location.reload();
      }}
      data-testid="menu-item-logout"
    >
      <LogOut className="h-4 w-4 mr-2" />
      {t.logout}
    </DropdownMenuItem>
  </DropdownMenuContent>
</DropdownMenu>
```

(Keep the `Globe` and `LogOut` imports — they're now used inside the dropdown items.)

### Step 5: Verify the existing menu still works

Run: `npm run check`
Expected: PASS.

There are no automated tests for the page header today; manual verification deferred to Task 6.

### Step 6: Commit

```bash
git add client/src/pages/SurgeonPortal.tsx
git commit -m "$(cat <<'EOF'
feat(surgeon-portal): account dropdown replaces inline header controls

The page header's inline [Globe + DE EN] [Logout] cluster collapses
into a single avatar button that opens a Radix DropdownMenu. The
menu shows name + email at the top, then Edit profile (opens the
My Data modal — wired up in the next commit), language toggle,
and Logout.

The avatar reuses surgeonInitials() exported from SurgeryRequestForm
in the previous commit, so the page-header avatar matches the
in-form Step 1 summary card.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: My Data dialog

**Files:**
- Modify: `client/src/pages/SurgeonPortal.tsx` — add `<MyDataDialog>` component and render it.

The dialog opens when the `myDataOpen` state added in Task 4 becomes true.

### Step 1: Add the `MyDataDialog` component

Add this private component near the top of the `SurgeonPortal` component body (above the `return`), or as a sibling component above `SurgeonPortal` if you prefer (either is fine — keep it scoped to this file):

```tsx
type MyData = {
  firstName: string;
  lastName: string;
  phone: string;
};

function MyDataDialog({
  open,
  onOpenChange,
  initial,
  email,
  t,
  token,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: MyData;
  email: string;
  t: (key: string) => string;
  token: string;
}) {
  const { toast } = useToast();
  const [values, setValues] = useState<MyData>(initial);
  const [touched, setTouched] = useState<Set<keyof MyData>>(new Set());

  // Re-initialize when the dialog opens or the underlying me data changes.
  useEffect(() => {
    if (open) {
      setValues(initial);
      setTouched(new Set());
    }
  }, [open, initial]);

  const dirty =
    values.firstName !== initial.firstName ||
    values.lastName !== initial.lastName ||
    values.phone !== initial.phone;

  const fieldValid = {
    firstName: values.firstName.trim().length > 0,
    lastName: values.lastName.trim().length > 0,
  };
  const showError = (k: keyof typeof fieldValid) =>
    touched.has(k) && !fieldValid[k];
  const markTouched = (k: keyof MyData) =>
    setTouched((prev) => (prev.has(k) ? prev : new Set(prev).add(k)));

  const mutation = useMutation({
    mutationFn: async (payload: MyData) => {
      const res = await fetch(`/api/surgeon-portal/${token}/me`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          firstName: payload.firstName.trim(),
          lastName: payload.lastName.trim(),
          phone: payload.phone.trim() === "" ? null : payload.phone.trim(),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || res.statusText);
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [`/api/surgeon-portal/${token}/me`],
      });
      toast({ title: t("myData.saveSuccess") });
      onOpenChange(false);
    },
    onError: (e: Error) => {
      toast({
        title: t("myData.saveFailed"),
        description: e.message,
        variant: "destructive",
      });
    },
  });

  const canSubmit = dirty && fieldValid.firstName && fieldValid.lastName && !mutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("myData.title")}</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            // Mark required fields touched so errors light up if invalid.
            setTouched(new Set(["firstName", "lastName", "phone"]));
            if (!fieldValid.firstName || !fieldValid.lastName) return;
            if (!dirty || mutation.isPending) return;
            mutation.mutate(values);
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="my-data-email">{t("email")}</Label>
            <Input id="my-data-email" value={email} disabled readOnly />
            <p className="text-xs text-muted-foreground">{t("myData.emailHint")}</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="my-data-first-name">{t("firstName")} *</Label>
            <Input
              id="my-data-first-name"
              value={values.firstName}
              onChange={(e) => setValues((v) => ({ ...v, firstName: e.target.value }))}
              onBlur={() => markTouched("firstName")}
              aria-invalid={showError("firstName") || undefined}
              className={showError("firstName") ? "border-destructive" : undefined}
              data-testid="input-my-data-first-name"
            />
            {showError("firstName") && (
              <p className="text-xs text-destructive">{t("validation.required")}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="my-data-last-name">{t("lastName")} *</Label>
            <Input
              id="my-data-last-name"
              value={values.lastName}
              onChange={(e) => setValues((v) => ({ ...v, lastName: e.target.value }))}
              onBlur={() => markTouched("lastName")}
              aria-invalid={showError("lastName") || undefined}
              className={showError("lastName") ? "border-destructive" : undefined}
              data-testid="input-my-data-last-name"
            />
            {showError("lastName") && (
              <p className="text-xs text-destructive">{t("validation.required")}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="my-data-phone">{t("phone")}</Label>
            <Input
              id="my-data-phone"
              value={values.phone}
              onChange={(e) => setValues((v) => ({ ...v, phone: e.target.value }))}
              data-testid="input-my-data-phone"
            />
          </div>

          <DialogFooter className="flex flex-col sm:flex-row gap-2 sm:justify-end pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={mutation.isPending}
              data-testid="button-my-data-cancel"
            >
              {t("myData.cancel")}
            </Button>
            <Button
              type="submit"
              disabled={!canSubmit}
              data-testid="button-my-data-save"
            >
              {mutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {t("myData.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

If `Loader2` isn't already imported, add it from lucide-react.

### Step 2: Render the dialog from the page

In the `SurgeonPortal` component's `return`, anywhere inside the top-level wrapper (`<div className="min-h-screen bg-background">`), add:

```tsx
{me && (
  <MyDataDialog
    open={myDataOpen}
    onOpenChange={setMyDataOpen}
    initial={{
      firstName: me.firstName ?? "",
      lastName: me.lastName ?? "",
      phone: me.phone ?? "",
    }}
    email={me.email ?? ""}
    t={tFn}
    token={token}
  />
)}
```

A natural placement is right after the existing `<ChangePasswordDialog>` / dialog mounts, or just before the closing `</div>` of the page wrapper.

### Step 3: Run typecheck

Run: `npm run check`
Expected: PASS.

### Step 4: Run all existing tests

Run: `npx vitest run`
Expected: no new failures (the existing surgery-request-form + surgeon-praxis-routes tests should all still pass).

### Step 5: Commit

```bash
git add client/src/pages/SurgeonPortal.tsx
git commit -m "$(cat <<'EOF'
feat(surgeon-portal): My Data dialog

Modal lets the surgeon update their own firstName, lastName, and
phone. Email is read-only with a hint explaining why ("used to log
in"). Save triggers the PATCH /me mutation, invalidates the me
query (refreshing the dropdown header + Step 1 summary card), and
shows a success/failure toast.

Same touched-on-blur + FieldError validation pattern as Phase 1's
inline form errors.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Final smoke test + verification

**Files:**
- None. Verification only.

- [ ] **Step 1: Run the full test suite**

Run: `npx vitest run`
Expected: no new failures relative to main.

- [ ] **Step 2: Run typecheck**

Run: `npm run check`
Expected: clean.

- [ ] **Step 3: Browser smoke**

Run: `npm run dev`. Open the surgeon portal as a logged-in surgeon and verify:

1. The page header right-side shows a single avatar circle with initials (e.g. "BM"). The old DE/EN buttons + standalone logout icon are gone.
2. Click the avatar — dropdown opens. Header line shows full name + email.
3. Click "Deutsch" / "English" — language toggles instantly; menu closes.
4. Click "Edit profile" — modal opens with email (disabled), first/last/phone pre-filled.
5. Try to save with first name cleared — Pflichtfeld error appears, Save stays disabled.
6. Type a valid value, change phone, click Save — toast "Profile updated" appears, modal closes, the avatar's initials update if name changed, and the in-form Step 1 summary card on the New Request tab shows the updated values.
7. Open the modal again, leave fields untouched, click Cancel — closes silently.
8. Try to logout — fetch fires, page reloads to the OTP gate.

- [ ] **Step 4: Final commit if any cleanup needed**

If anything surfaced, fix it inline and commit.

```bash
git status
```
Expected: clean tree.

---

## Self-review checklist (run after writing the plan)

- [x] **Spec coverage:** Tasks 1–6 cover all three spec changes (account dropdown, My Data modal, PATCH /me) plus i18n and verification. Out-of-scope items (address fields, photo upload, theme, billing IDs, praxis-edits-children) remain unaddressed by design.
- [x] **No placeholders:** every step has actual code or an exact decision rule.
- [x] **Type consistency:** `MyData` (the local form-state type) and the PATCH body shape (`{ firstName, lastName, phone }`) match. The Zod schema accepts `phone: z.union([z.string(), z.null()])` and the client sends `null` for empty strings — server normalizes empty-string-after-trim to null too as belt-and-braces.
- [x] **i18n key references:** every `t("...")` call in the dialog/menu corresponds to a key added in Task 1 or already exists from earlier phases (`firstName`, `lastName`, `email`, `phone`, `validation.required`).
- [x] **`createPortalSessionCookie`** is called out as something to discover from the existing test file rather than invented; the implementer must inspect `tests/surgeon-praxis-routes.test.ts` for the existing helper before adapting the test signatures.
