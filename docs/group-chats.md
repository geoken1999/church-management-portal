# Group chats

People → **Groups** (web) and **Group chats** (member app Space tab, team app Services). Migration `0206_church_group_chats.sql`.

## Model

- `church_groups`: a group of a church (name, description, archived_at).
- `church_group_members`: who is in it. A church member (`member_id`; their `auth_user_id` is copied from the member and
  follows when they sign in later) or a team login that is not a member (`auth_user_id` only). `role` is `member` or
  `admin`. Each row also holds that person's own `notify_mode` (`all`, `mentions`, `none`), `muted_until` and
  `last_read_at` (for the unread count).
- `church_group_messages`: text, an optional picture or file (private bucket `group-chat`), a reply, @mentions (logins),
  an announcement flag. A deleted message keeps its row with `deleted_at` so chats show "This message was deleted".

## Who can do what

- **Read**: only people in the group (RLS on the messages, which Realtime follows). The apps read through `cg_my_groups`,
  `cg_messages`, `cg_participants`, `cg_mark_read` and `cg_set_notifications`, with the person's own session.
- **Write** (groups, people, messages): the server only, with the service role, after its own checks
  (`src/lib/group-chat/service.ts`). The web uses server actions (`actions.ts`, tab `groups`: Read to see, Write to create,
  manage and post, Delete to archive a group and delete other people's messages); the apps call `/api/mobile/groups/{send,
  upload,attachment,delete}`.
- Posting from the web makes a team login part of the group (as an admin), so they are notified of replies.
- Announcements: group admins, or anyone with Write on the Groups tab.

## Notifications

`notificationRecipients` (`src/lib/group-chat/rules.ts`): everyone in the group with a login except the sender; "all" gets
every message, "mentions" only a message that @mentions them or an announcement, "none" nothing, and an unexpired mute
silences everything. Push category `group_post` (so the member's existing group-post preference applies); the payload
carries `type: group_chat` and the group id, and tapping it opens the chat in the app.

## Not built yet

Message editing, reactions, read receipts, typing indicators, push for the web, a screen to start a group from the app, and
removing a member's messages when they leave the church.
