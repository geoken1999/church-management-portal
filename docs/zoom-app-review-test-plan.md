# KingdomFlow for Zoom: test plan for Marketplace review

Production site: https://www.kingdomflow.in
App type: Zoom General app (OAuth + Meeting SDK for web). OAuth redirect URL: `https://www.kingdomflow.in/api/zoom/callback`

## 1. What the integration does

KingdomFlow is church-management software. A church (an "organization") connects **its own Zoom account** once. After that, its staff can create Zoom meetings from KingdomFlow, start them as host or join them as a guest **inside the KingdomFlow page** (Zoom Meeting SDK for web), share the invite link, and cancel them. Members who use the KingdomFlow mobile app can be sent a "meeting is live" push notification with a Join button.

No Zoom data is read other than the connecting user's profile (name, email, id). KingdomFlow does not read recordings, chats, participants or contacts.

## 2. Scopes requested and where each is used

| Scope | Required? | Used for | How to test |
|---|---|---|---|
| `user:read:user` | Required | `GET /users/me` once, right after consent, to show "Connected as <name> (<email>)" | Section 5, step 5 |
| `meeting:write:meeting` | Required | `POST /users/me/meetings` when a meeting is created | Section 6 |
| `meeting:delete:meeting` | Required | `DELETE /meetings/{id}` when a meeting is deleted in KingdomFlow | Section 9 |
| `user:read:zak` | Required for "Start as host" inside KingdomFlow | `GET /users/me/token?type=zak`, passed to the Meeting SDK so the church's account can start the meeting in the page | Section 7 |

There are **no optional scopes**. All four are needed for the full flow. Without `user:read:zak` the in-page host start is not possible; the app then offers a fallback link to start the meeting in the Zoom desktop app (step 7.6).

The Meeting SDK signature is generated server-side from the app's Client ID/Secret; the secret is never sent to the browser.

## 3. Test accounts

KingdomFlow accounts are provisioned by us. Replace the placeholders before sending this plan; do not reuse these examples.

| Role | Login (email / password) | Can do |
|---|---|---|
| Church Owner (primary) | `<REVIEWER_OWNER_EMAIL>` / `<REVIEWER_OWNER_PASSWORD>` | Everything, including connect and disconnect Zoom |
| Church Admin | `<REVIEWER_ADMIN_EMAIL>` / `<REVIEWER_ADMIN_PASSWORD>` | Connect/disconnect Zoom, create, start, delete |
| Staff with full K-Connect access | `<REVIEWER_STAFF_EMAIL>` / `<REVIEWER_STAFF_PASSWORD>` | Create, start, join, delete. Cannot connect or disconnect |
| Staff with read-only K-Connect access | `<REVIEWER_READONLY_EMAIL>` / `<REVIEWER_READONLY_PASSWORD>` | See meetings and join as guest only. Cannot create, start or delete |
| Staff without K-Connect access | `<REVIEWER_NOACCESS_EMAIL>` / `<REVIEWER_NOACCESS_PASSWORD>` | Sees "Access restricted" |

Sign-in page: https://www.kingdomflow.in/login (email and password).

**Zoom account for the reviewer.** The reviewer uses their own Zoom account (a **licensed/Pro** account is best, because hosting from the SDK needs a licensed host; a Basic account works with Zoom's 40-minute limit). While the app is not yet published, that Zoom account must be allowed to install the app (same Zoom account as the app owner, or added as a tester). Zoom credentials are supplied by the reviewer; we do not provide any.

**Two-factor authentication.** KingdomFlow sign-in does not use 2FA, so none is needed to reach the screens below. If the reviewer's Zoom account has 2FA, they will be asked for it on Zoom's own sign-in page during step 5.

**Paid plan / access controls.**
- The Zoom feature does not need a paid KingdomFlow plan. It is part of the K-Connect tab, which is on for the reviewer organization.
- K-Connect also has a per-plan monthly minutes limit for KingdomFlow's own video calls. It does **not** apply to Zoom meetings, which follow the Zoom account's own plan limits.
- Each KingdomFlow staff login can be given per-tab permissions (none, read, write). The accounts above are pre-set to those levels.

## 4. Seed data in the reviewer organization

Pre-created for you: one organization ("Reviewer Church"), the five logins above, two branches ("Main Branch", "North Branch"), and a few members. No Zoom connection exists at the start, so the connect step can be tested from scratch.

**Optional, for the push-notification test (section 10):** install the KingdomFlow mobile app (Android or iPhone) and sign in as a member. Provide one mobile login: `<REVIEWER_MEMBER_PHONE_OR_EMAIL>` (we will confirm how it signs in when we send the credentials). Skip section 10 if no phone is available; it does not affect the Zoom review.

## 5. Connect the Zoom account (OAuth)

Sign in at https://www.kingdomflow.in/login as the **Owner**.

1. Open **K-Connect** in the left menu, then press **Zoom and Google Meet**.
   *Expected:* the page "Zoom and Google Meet" with a Zoom card showing **Connect Zoom** and a Google Meet card.
2. Press **Connect Zoom**.
   *Expected:* the browser goes to `zoom.us/oauth/authorize` showing the KingdomFlow app name and the four permissions above.
3. Sign in to Zoom if asked, then press **Allow**.
   *Expected:* you return to `…/dashboard/kconnect/conferencing`.
4. *Expected:* a green "Connected." message appears.
5. *Expected:* the Zoom card shows "Connected: <account name> (<account email>)" (this comes from `user:read:user`) and a **Disconnect** button.
6. Press **Connect Zoom** again, then **Cancel/Deny** on Zoom's page.
   *Expected:* you return with "The connection was cancelled." and the connection is unchanged.

Negative checks:
7. Sign out, sign in as **Staff with full K-Connect access**, open the same page.
   *Expected:* the Zoom card says "An owner or admin needs to connect the church's Zoom account." (or shows the connected account with no Disconnect button); only owners and admins can connect.
8. Open `https://www.kingdomflow.in/api/zoom/connect` directly while signed in as that staff user.
   *Expected:* redirected back with "Only an owner or admin can connect an account."; no Zoom page opens.
9. Open `https://www.kingdomflow.in/api/zoom/callback?code=abc&state=bad` while signed in as Owner.
   *Expected:* redirected back with "That sign-in expired. Please try again."; nothing is saved. (The state value is signed and bound to the user and organization.)

## 6. Create meetings (`meeting:write:meeting`)

As **Owner** (or Admin, or full-access Staff):

1. In the Zoom card, under **New meeting**, enter the title `Review test now`, leave **When** empty, set **Minutes** to `30`, leave **Who is it for?** as **Whole church**, then press **Create Zoom meeting**.
   *Expected:* the meeting appears in the list with the title, the length and the audience "Whole church". In Zoom (zoom.us → Meetings), a meeting `Review test now` exists with the waiting room enabled.
2. Create a second meeting titled `Review test scheduled`, pick a start time tomorrow, length `45`, audience **Main Branch**.
   *Expected:* it appears with its start time and "Main Branch". In Zoom it shows as a scheduled meeting at that time.
3. Create a third meeting for the audience **Group → Youth**.
   *Expected:* it appears with "Youth".
4. Try to create a meeting with an empty title, and one with **Minutes** `3`.
   *Expected:* with an empty title the **Create Zoom meeting** button stays disabled; with `3` minutes the message "Choose a length between 5 minutes and 24 hours" is shown. No meeting is created in either case.
5. Press the **copy** button next to a meeting.
   *Expected:* the Zoom invite link is copied and the icon changes to a check.

Negative check:
6. Sign in as **Staff with read-only K-Connect access**.
   *Expected:* the **New meeting** form and the **Start** and delete buttons are not shown.

## 7. Start as host inside KingdomFlow (`user:read:zak`, Meeting SDK)

Use **two browsers or profiles** for steps 7 to 10 (Host and Guest).

**Host browser, signed in as Owner:**

1. On the `Review test now` row press **Start**.
   *Expected:* a page titled with the meeting, with a **Start the meeting** button.
2. Press **Start the meeting** and allow the microphone/camera if asked.
   *Expected:* the Zoom meeting window loads inside the page and you are in as the **host** (host controls such as Participants/Security are visible). The Zoom account's name is shown as the host.
3. In Zoom the meeting shows as started.
4. Check the in-page Zoom controls: mute/unmute, start/stop video, share screen, chat, participants, reactions.
   *Expected:* all work normally.
5. Press **Leave** or **End**, then navigate back.
   *Expected:* the meeting ends or you leave cleanly and the page returns to the list.
6. Fallback check (only if the in-page start is blocked, for example by an unsupported browser): the page shows a link **Start it in the Zoom app instead**.
   *Expected:* opening it launches the Zoom client as host.

## 8. Join as a guest, and multi-user flow

**Guest browser, signed in as Staff with full K-Connect access** (or the read-only staff):

1. While the host is in the meeting (step 7.2), open K-Connect → Zoom and Google Meet and press **Join** on `Review test now`.
2. Press **Join the meeting**.
   *Expected:* the guest loads the same in-page Zoom window and lands in the **waiting room** (the meeting is created with the waiting room on and "join before host" off).
3. In the **Host** browser, open Participants and **Admit** the guest.
   *Expected:* the guest enters the meeting. Both sides see each other and can hear each other.
4. The host mutes the guest, then removes the guest.
   *Expected:* both actions work; the removed guest returns to the list.
5. Join as guest with the **Staff without K-Connect access** login.
   *Expected:* the K-Connect page shows "Access restricted"; no meeting can be opened.
6. Join as the **read-only** staff login.
   *Expected:* **Join** works; **Start** is not offered, and opening `…/zoom/<id>?as=host` still joins only as a guest.
7. Sign out and open `https://www.kingdomflow.in/dashboard/kconnect/conferencing/zoom/<any id>`.
   *Expected:* redirected to the sign-in page; meeting details are not shown to anyone who is not signed in to that church.

Cross-organization check (if a second organization is supplied): a user of another church opening the same URL gets "not found".

## 9. Delete a meeting (`meeting:delete:meeting`)

As Owner:

1. Press the trash icon on `Review test scheduled` and confirm the prompt ("It is cancelled in Zoom too").
   *Expected:* it disappears from the list **and** is cancelled in Zoom (it no longer appears under Upcoming meetings in zoom.us).
2. Delete a meeting that was already deleted in Zoom directly.
   *Expected:* it still disappears from KingdomFlow with no error.

## 10. Optional: "meeting is live" notification (mobile app)

1. Sign in to the KingdomFlow mobile app on the member account in section 4.
2. As Owner on the web, **Start** `Review test now` (audience Whole church) and press **Start the meeting**.
   *Expected:* once the host is actually in the meeting, the member's phone receives "Review test now is live — A Zoom meeting has started. Tap to join." The person who started it does not get one.
3. Tap the notification.
   *Expected:* the Zoom join link opens.
4. Repeat for the **Main Branch** meeting.
   *Expected:* only members of that branch get the notification; the same meeting never notifies twice.

## 11. Disconnect (token revocation)

As Owner:

1. In the Zoom card press **Disconnect** and confirm the browser prompt.
   *Expected:* after confirming the prompt, the card returns to **Connect Zoom**, the **New meeting** form disappears, and existing meetings stay listed. Pressing **Start** on one and then **Start the meeting** shows "Connect your Zoom account first."
2. In Zoom → Account → Apps (My Apps), the KingdomFlow app no longer appears as installed, because KingdomFlow revokes the token with Zoom (`/oauth/revoke`).
3. Sign in as **Admin**; **Disconnect** is available to them, and not to staff.

## 12. Security and data handling points

- The OAuth `state` is signed and checked against the signed-in user and organization (section 5, step 9).
- Zoom access and refresh tokens are encrypted (AES-256-GCM) before they are stored and are never sent to the browser. The refresh token is replaced each time Zoom issues a new one.
- Only the church's owners and admins can connect or disconnect; other staff access follows per-tab permissions.
- The only personal data taken from Zoom is the connecting user's id, name and email.
- Privacy policy: https://www.kingdomflow.in/privacy · Documentation (no sign-in needed): https://www.kingdomflow.in/docs · Support: https://www.kingdomflow.in/contact

## 13. Known limits (not defects)

- Participant limits, meeting length and features such as breakout rooms follow the church's Zoom plan.
- Google Meet is a separate integration on the same page and is out of scope for this review.
- A Basic Zoom account ends a group meeting at 40 minutes.
