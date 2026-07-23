# TaskFlow — Project Spec

A collaborative group + task management platform, similar in structure to WhatsApp (groups, chat, DMs) combined with Asana-style project/task management (projects, tasks, assignment, admin roles).

Two HTML prototypes are included alongside this spec (`taskflow-preview.html` for the admin/owner view, `taskflow-preview-femi.html` for a regular member's view). Treat these as the UX reference for layout, flows, and interaction patterns — build the real app to match their behavior, not their exact code (they are static mockups with no real backend).

---

## Stack

- **Framework**: Next.js (App Router) — frontend + API routes in one project
- **Database**: MongoDB Atlas
- **ODM**: Mongoose
- **Auth**: NextAuth.js (Auth.js) — credentials provider (email/password) + Google OAuth provider, MongoDB adapter
- **Email**: Resend (transactional email for notifications)
- **Hosting**: Vercel (app) + MongoDB Atlas (database)

---

## Account model

- Sign up as **Individual** or **Organization**.
  - Individual: a personal account. Can create groups directly.
  - Organization: signup includes an org name. The signing-up user becomes the org owner. An org can contain multiple groups.
- **Google OAuth sign-up is always an Individual account.** Organization signup requires deliberately naming an org, which doesn't fit a one-click OAuth flow — so Google sign-up skips that choice and defaults to Individual. A user can still be invited into and become a member of an org-owned group even with an Individual account; the account-type only determines whether *they* own an org, not whether they can participate in one.
- **Organization owner has automatic admin rights on every group under their org**, even groups they didn't personally create.
- Groups created by an Individual have no org association (`orgId: null`).

---

## Core hierarchy

```
Organization (optional container, org accounts only)
  └─ Groups (one or many)
       ├─ Members (role: admin | member)
       ├─ Projects
       │    └─ Tasks
       │         ├─ Subtasks (checklist)
       │         ├─ Attachments
       │         └─ Task chat (assigner ↔ assignee only)
       ├─ Group chat (all members)
       └─ Activity log

Direct Messages (1:1, independent of groups)
```

---

## Groups

- Any user (individual or org) can create a group. Creator becomes admin automatically.
- Group page has three tabs: **Projects**, **Chat**, **Members**.
- Admin can delete the group (soft delete — see Data integrity notes).
- Multiple admins allowed per group.

### New group onboarding

- When a group is first created (no projects yet), show a lightweight onboarding checklist instead of an empty state: "Create your first project" → "Invite your team" → "Assign a task." Each step links directly to the relevant action.
- Dismiss automatically once the group has at least one project and more than one member, or let the admin dismiss it manually.

### Membership

- **Invite-only.** No public group discovery.
- Two invite methods, both available to admins:
  - **Email invite (primary)** — admin enters a specific email address, an invite email is sent directly to that person with a join link. Preferred because it's traceable — the Members list (or a "Pending invites" sub-section) can show who's been invited but hasn't joined yet.
  - **Link invite (secondary)** — admin generates a shareable link (`token`, expiry, optional `maxUses`) to drop anywhere (e.g. an external WhatsApp group). Useful when the admin doesn't have everyone's email upfront or wants to let multiple people self-join from one link.
- Admin can remove members and promote members to admin.
- Members can leave a group voluntarily.
- Only admins can manage members (remove, promote/demote) — regular members see a read-only member list with a "Message" action per person.
- **A group must always have at least one admin.** If there's only one admin left, they cannot leave the group, demote themselves, or be removed until they promote another member to admin first. Enforce this server-side — block the action with a clear message ("Promote another member to admin before leaving/stepping down") rather than allowing an adminless group to exist.
- **An admin (who is not the last admin) trying to leave the group, or demote themselves to a regular member, while there are tasks in Pending review in that group is blocked.** This is a hard block, not just a confirmation — enforced server-side, same treatment as a member being blocked from leaving with assigned tasks. Applies to both actions (leaving entirely, and self-demotion while staying in the group), since either one removes their admin ability to review those pending tasks. Show a clear message (e.g. "There are 4 tasks pending review in this group. Review or reassign them before you can leave or step down."). Once every pending-review task in the group has been approved or rejected, the admin is free to leave or self-demote with a normal confirmation. If the admin is also the last admin, the last-admin rule above applies and blocks it for that reason regardless.
- **When an admin removes a member from a group, any tasks currently assigned to that member become unassigned** (`assignedTo: null`) rather than being deleted or left pointing at a non-member. The group's admins are notified that these tasks need reassignment, and unassigned tasks should be visibly flagged on the project board (e.g. "Unassigned" instead of a name) until an admin reassigns them. Note: this unassignment path only happens via admin-forced removal — voluntary leaving is blocked while tasks are assigned (see below), so a member can never leave and orphan their own tasks.
- **Confirmation dialogs and rules for removal vs. leaving — these are NOT symmetric:**
  - **Admin removing a member**: this is a forceful, admin-initiated action. Before removal, show a confirmation dialog stating how many tasks are currently assigned to that member (e.g. "Femi Adeyemi has 3 tasks assigned. Removing them will make these tasks unassigned. Are you sure?"). If confirmed, the member is removed regardless of task count, and their tasks become unassigned (`assignedTo: null`) as described above. If the member has zero active tasks, a simpler confirmation is shown without the task-count warning.
  - **Member leaving a group voluntarily**: **a member cannot leave a group while they have tasks assigned to them.** This is a hard block, not just a warning — the "Leave group" action is disabled/rejected (server-side, not just UI) if `assignedTo` tasks exist for that user in that group. Show a clear message explaining why (e.g. "You have 2 tasks assigned in this group. Ask an admin to reassign them before you can leave, or move them to Done first."). Once the member has zero assigned tasks (reassigned by an admin, or completed and approved), they're free to leave with a normal "Are you sure you want to leave [Group Name]?" confirmation.
  - The asymmetry is intentional: admins have the authority to force a removal and deal with the fallout (reassigning orphaned tasks), but a member choosing to leave on their own shouldn't be able to walk away and leave their own work in limbo.

#### Link invite flow (detailed)

1. User clicks the invite link (`/invite/[token]`).
2. Server validates the token: checks it exists, hasn't expired, and hasn't exceeded `maxUses`.
   - If invalid/expired/exhausted → show a friendly error page ("This invite link has expired, ask the admin to send a new one"). No join occurs.
3. Check auth state:
   - **Logged in** → proceed to step 4.
   - **Not logged in** → show an invite landing page ("You've been invited to join *[Group Name]*") with Sign up / Log in options. The invite token must persist through the auth flow (e.g. query param carried through, or a short-lived session/cookie) so the join still happens after the user authenticates.
4. Check membership state:
   - **Already a member of this group** → show a small "You're already a member" note, then redirect them into the group. Do not increment `useCount` or duplicate the `groupMembers` record.
   - **Not yet a member** → add a `groupMembers` record (role: `member`), increment the invite's `useCount`, redirect into the group.
5. On successful join: post a system message in group chat ("[Name] joined the group") and notify group admins.

---

## Projects

- Admin creates a project inside a group: name, description, deadline (optional), status (Active / Completed / Archived).
- Only admins can create/edit/delete projects.
- Project page offers two views:
  - **Board view** — Kanban-style columns: **To do / In progress / Pending review / Done**. Rejected tasks return to the In progress column; the task shows an indicator when it has rejection history, with full details visible on the task detail page and in task chat.
  - **Calendar view** — month/week grid showing tasks by due date across the project (or across an entire group, showing all projects together). Useful once a project has more than a handful of tasks and due dates need to be seen at a glance rather than scanned column by column.

---

## Tasks

- Admin creates a task under a project: title, description, single assignee (must be a group member), due date. No priority levels — every task is treated as equally important, so there's no priority field.
- **Status lifecycle**: To do → In progress → Pending review → Done, with a Rejected path back to In progress.
  - Assignee moves a task through To do → In progress themselves.
  - When the assignee considers the task finished, they submit it — status becomes **Pending review**. This is not the same as Done; it requires admin approval.
  - Admin reviews a pending task and either:
    - **Approves** it → status becomes **Done**.
    - **Rejects** it → status returns to **In progress**, and the admin must provide a comment/reason for the rejection.
  - **Full rejection history is kept, not just the latest reason.** Every rejection is appended to the task's `rejectionHistory` array (reviewer, reason, timestamp) so if a task is rejected multiple times, the assignee can see the full sequence of feedback, not just the most recent note.
  - **Every rejection automatically posts into the task chat** as a message from the admin (containing the reason), so it's visible in the same thread the assignee is already checking — not a separate, easy-to-miss field. This also means the task-chat unread badge/highlight (see below) naturally fires on rejection.
  - Only an admin can move a task from Pending review to Done or back to In progress. An assignee cannot self-approve.
- **Assignee can:**
  - Move the task through To do → In progress → Pending review
  - Chat with the assigner in the task's private task chat
  - Check/uncheck subtasks
  - Add attachments
  - **Cannot delete the task**
  - **Cannot approve their own submission**
- **Only an admin or the task's original creator can delete a task.** This is a hard rule — enforce it server-side, not just in the UI.
- Admin can edit/reassign/delete any task in their group, and approves/rejects submissions.
- **Notifications**: admin is notified immediately every time a task is submitted for review (not batched into a digest — this needs a timely response so work doesn't stall). Assignee is notified immediately on approval or rejection.

### Admin review queue

- A dedicated view (accessible from the sidebar or dashboard) showing pending-review tasks across every group the admin manages.
- **Organized as grouped sections by Group, not one flat mixed list.** Each group the admin has admin rights on gets its own section (e.g. "Marketing Team", "Sales Ops"), showing only that group's pending-review tasks, sorted oldest-submitted-first within each section. This keeps context intact — an admin managing multiple groups shouldn't have to mentally re-sort a jumbled list to figure out what belongs where.
- If the admin is only an admin of one group, this naturally collapses to a single section.
- A group section with zero pending tasks can be collapsed or omitted rather than shown empty, to keep the view focused on what actually needs attention.
- Each row within a section shows: task title, project (project name is enough — the group is already established by the section header), assignee, how long it's been waiting, with a quick link into the task detail to approve/reject.
- No bulk approve/reject in v1 — each task is reviewed and actioned individually.


### Recurring tasks

- A task can optionally repeat: `recurrence: 'none' | 'daily' | 'weekly' | 'monthly'`.
- When a recurring task is approved (moved to Done), a new instance is automatically created for the next occurrence, copying title/description/assignee/subtasks, with a fresh due date and status reset to To do.
- V1 can store the field and generate the next instance on approval; a full recurrence-editing UI can come later.

### Subtasks (checklist)

- A task can have an ordered list of subtasks, each with `text` and `done: boolean`.
- Assignee or admin can toggle subtask completion.
- Show progress on the task card (e.g. "3/5 subtasks done").

### Attachments

- Tasks, group chat messages, task chat messages, and DM messages can all carry file/image attachments.
- Store as `{ url, name, type, size }` — actual file storage should go to a blob store (e.g. Vercel Blob, S3, or Cloudinary), with only the reference stored in MongoDB.

### Task chat

- Private thread scoped **only** to the task's assignee and assigner (not the whole group).
- Distinct from the description (which is long-form and static) and from group chat (which is everyone).
- See the Femi preview (`taskflow-preview-femi.html`) for the two-column layout: description + metadata on the left, task chat on the right.

#### Unread task chat indicator

- When a task has unread task-chat messages (from the other party's perspective — assignee unread from admin, or admin unread from assignee), show **both**:
  - A small numbered badge on the task card (board view) and on the "Task chat" panel header (task detail view), same visual style as the DM unread badges.
  - A subtle highlighted border/background on the task card itself, so unread activity is visible at a glance when scanning a busy board, not just when looking directly at the badge.
- Badge count clears once the viewer opens the task chat panel (mark-as-read on open, same pattern as DMs).
- This uses the same `readAt`-per-message tracking already defined on `taskChatMessages` — no new schema needed, just a derived unread count per task per viewer.

---

## Chat systems (three distinct layers — do not conflate)

### 1. Group chat
- One thread per group, all members can post.
- Read receipts: aggregate style — "Seen by 3" rather than per-person detail (per-person gets noisy in groups).
- Supports @mentions (see below) and attachments.
- System messages appear inline (e.g. "Femi Adeyemi joined the group", "Amara assigned 'Draft social copy' to Femi") — these are generated automatically, not user-typed.

### 2. Task chat
- One thread per task, scoped to assignee + assigner only.
- Same message shape as group chat (attachments, timestamps) but no @mentions needed (only 2 participants).

### 3. Direct messages (DMs)
- 1:1 private chat, independent of any group.
- **How a DM starts**: only from a group's Members list (click a member's "Message" button or their name). No general "start a new DM with anyone" search — this matches the finalized UX decision.
- Read receipts: per-message "Seen" / "Delivered" status under the sender's last sent message (see Femi preview for exact behavior).
- **Unread badges**: each DM shows an unread count badge in the sidebar and inbox.
- **Sidebar behavior**: show a maximum of 3 most-recent conversations in the left nav, sorted by recency. If there are more than 3, show a "See all messages" link.
- **DM inbox screen**: a full-width, full-list view of all conversations (like WhatsApp's main screen) — avatar, name, last message preview (prefixed "You:" if the last message was sent by the current user), timestamp, unread badge. This screen should take the full content width, not be constrained to a narrow card (see Femi preview for the corrected full-width layout).
- **Back navigation**: the DM conversation screen has a back button that returns to wherever the user came from — the group chat, the DM inbox, or the dashboard if opened directly from the sidebar. Track origin explicitly (see Femi preview's `dmOrigin` pattern) rather than assuming a single "back" destination.

### @mentions
- Available in group chat and task chat.
- Typing `@name` tags that person and triggers a targeted notification to them, distinct from the general "new message" notification.

### Search
- Across tasks, messages (group + task + DM), and members.
- For MongoDB Atlas, use **Atlas Search** (Lucene-based) rather than basic regex queries once there's real data volume — plan the index but a basic text index is an acceptable v1 fallback.

---

## Activity log

- Separate collection per group — distinct from chat, structured and queryable.
- Logs actions like: member added/removed, role changed, project created, task created/reassigned/deleted, group settings changed.
- Not the same as group chat's system messages — those are a lightweight user-facing echo; the activity log is the structured source of truth (chat system messages can be generated from activity log entries).

---

## Notifications

- Triggers: added to a group, assigned a task, task reassigned, **task unassigned due to member removal (notify group admins)**, deadline approaching, **task submitted for review (notify admin immediately, not batched)**, **task approved / rejected (notify assignee)**, new @mention, new DM message.
- Channel: email (via Resend) for v1.
- **Reminders**: due-date reminders should be recurring nudges (e.g. a daily digest for tasks due soon), not a single one-time "24 hours before" ping — people miss single pings. This requires a scheduled job (Vercel Cron or a background worker).
- In-app notifications list — shows a preview/description snippet under task-related notifications (not just the bare event line), per the Femi preview's Notifications page.

---

## Voice / video calls

- **Treat as a separate milestone, not part of the initial build.** Building WebRTC signaling from scratch is a multi-week effort on its own.
- Recommended approach: integrate a third-party service (Twilio Video, Daily.co, Agora, or Stream Video) rather than building raw WebRTC.
- Scope this after Phases 1–3 below are stable.

---

## Data integrity notes

- **Soft delete**: groups and tasks should use a `deletedAt` timestamp field rather than hard deletion, so accidental deletes are recoverable. Filter out soft-deleted records in normal queries.
- **Permission enforcement must be server-side.** Every mutation (task delete, member removal, role change, etc.) must re-check the actor's role/relationship in the API route — never trust client-side UI state alone.

---

## MongoDB collections (Mongoose models)

```js
// users
{
  _id, email, passwordHash, name,
  accountType: 'individual' | 'organization',
  createdAt
}

// organizations
{
  _id, name, ownerId: ObjectId(users), createdAt
}

// groups
{
  _id, name,
  orgId: ObjectId(organizations) | null,
  createdBy: ObjectId(users),
  createdAt,
  deletedAt: Date | null
}

// groupMembers
{
  _id, groupId: ObjectId(groups), userId: ObjectId(users),
  role: 'admin' | 'member', joinedAt
}
// indexes: unique compound { groupId: 1, userId: 1 }; also index userId alone for "my groups" queries

// inviteLinks
{
  _id, groupId: ObjectId(groups),
  type: 'email' | 'link',
  email: String | null,       // set when type === 'email'
  token: String,
  createdBy: ObjectId(users), expiresAt, maxUses, useCount,
  status: 'pending' | 'accepted' | 'expired'   // useful for showing "pending invites" in Members list
}

// projects
{
  _id, groupId: ObjectId(groups), name, description,
  status: 'active' | 'completed' | 'archived',
  deadline, createdBy: ObjectId(users), createdAt
}

// tasks
{
  _id, projectId: ObjectId(projects), title, description,
  assignedTo: ObjectId(users) | null, createdBy: ObjectId(users),
  status: 'todo' | 'in_progress' | 'pending_review' | 'done',
  rejectionHistory: [{ reviewerId: ObjectId(users), reason: String, createdAt: Date }],
  deadline,
  recurrence: 'none' | 'daily' | 'weekly' | 'monthly',
  subtasks: [{ text: String, done: Boolean }],
  attachments: [{ url: String, name: String, type: String, size: Number }],
  createdAt, deletedAt: Date | null
}
// delete permission: only createdBy or a group admin — enforce server-side
// assignedTo becomes null only when the assigned member is force-removed by an admin;
// voluntary leaving is blocked server-side while the member has assigned tasks, so leaving never triggers this path
// group admins are notified and the task shows as "Unassigned" until reassigned
// status transitions: assignee may move todo -> in_progress -> pending_review;
// only an admin may move pending_review -> done or pending_review -> in_progress
// (rejection pushes a new entry onto rejectionHistory and auto-posts the reason into taskChatMessages)

// taskHistory   (per-task audit trail, distinct from the group-wide activityLog)
{
  _id, taskId: ObjectId(tasks), actorId: ObjectId(users),
  field: String,        // e.g. 'status', 'deadline', 'assignedTo'
  oldValue, newValue,
  createdAt
}

// taskChatMessages
{
  _id, taskId: ObjectId(tasks), senderId: ObjectId(users),
  text: String,
  attachments: [{ url, name, type, size }],
  createdAt, readAt: Date | null
}

// groupMessages
{
  _id, groupId: ObjectId(groups), senderId: ObjectId(users),
  text: String,
  attachments: [{ url, name, type, size }],
  mentions: [ObjectId(users)],
  readBy: [{ userId: ObjectId(users), readAt: Date }],
  createdAt,
  isSystemMessage: Boolean  // for auto-generated join/leave/task-assigned lines
}

// dmThreads
{
  _id, participantIds: [ObjectId(users), ObjectId(users)],
  lastMessageAt
}
// index: participantIds

// dmMessages
{
  _id, threadId: ObjectId(dmThreads), senderId: ObjectId(users),
  text: String,
  attachments: [{ url, name, type, size }],
  createdAt, readAt: Date | null
}

// activityLog
{
  _id, groupId: ObjectId(groups), actorId: ObjectId(users),
  action: String,        // e.g. 'member_removed', 'task_reassigned'
  targetType: String,    // e.g. 'task', 'member', 'project'
  targetId: ObjectId,
  meta: Object,           // free-form extra detail
  createdAt
}

// notifications
{
  _id, userId: ObjectId(users), type: String,
  payload: Object,
  read: Boolean,
  createdAt
}
```

---

## Build phases

**Phase 1 — Foundation**
- Mongoose connection singleton + all models
- NextAuth setup (credentials provider + Google OAuth + MongoDB adapter), signup as Individual/Organization (Google sign-up always creates an Individual account)
- Groups: create, delete (soft), list, new-group onboarding checklist
- Invite flow: email invite (primary) and link invite (secondary), full redeem flow including expired/already-a-member cases
- Membership management: remove, promote/demote (admin-only, server-enforced), last-admin protection (can't leave/demote/be removed if it would leave the group adminless), tasks auto-unassigned on admin-forced removal with admin notification, voluntary leaving blocked server-side while member has assigned tasks, admin leaving/self-demoting blocked server-side while group has pending-review tasks, confirmation dialogs before removal/leaving showing assigned-task counts
- Projects: CRUD (admin-only for create/edit/delete), board view + calendar view
- Tasks: CRUD, assignment, subtasks, attachments, recurrence field, correct delete permission (creator/admin only, not assignee)
- Task status workflow: to do → in progress → pending review → done, with admin-only approve/reject (reject requires a reason, returns task to in progress, full rejection history kept and auto-posted to task chat), task history log
- Admin review queue view (pending-review tasks grouped into per-group sections, not one flat cross-group list)

**Phase 2 — Communication**
- Group chat (with system messages, @mentions, attachments, aggregate read receipts)
- Task chat (assigner ↔ assignee only)
- Direct messages (member-list-only entry point, unread badges, per-message Seen/Delivered, 3-item sidebar cap + "See all" inbox, back-navigation with origin tracking)
- Activity log (per group, structured)

**Phase 3 — Notifications & search**
- Email notifications via Resend for all triggers listed above
- Recurring due-date reminder digest (Vercel Cron or background worker)
- In-app notifications list with description snippets
- Search across tasks, messages, members (Atlas Search preferred; basic text index acceptable for v1)

**Phase 4 — Voice/video (separate milestone)**
- Evaluate and integrate a third-party calling service (Twilio Video, Daily.co, Agora, or Stream Video)
- Scope in detail only once Phases 1–3 are stable and deployed

---

## Reference files

- `taskflow-preview.html` — admin/org-owner point of view (full permissions)
- `taskflow-preview-femi.html` — regular member point of view (restricted permissions, DM inbox, task chat with side-panel description)

Use these for exact layout and interaction reference — they are static HTML/JS mockups with hardcoded sample data, not connected to any backend.
