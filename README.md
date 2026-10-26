# CampusConnect

A student networking platform (MERN): profiles, feed, connections, real-time chat, events, projects, opportunities.

**Status: Phases 1-3 complete, plus persistent real-time notifications.** See the checklist below.

## Stack
React + Vite + Tailwind + React Router + Axios + Lucide | Node + Express + JWT + bcryptjs + Socket.IO | MongoDB + Mongoose

## Setup (Windows PowerShell / VS Code terminal)
```powershell
# 1. Install Node.js 18+ and MongoDB (or use a free MongoDB Atlas cluster)
# 2. From the CampusConnect folder:
Copy-Item backend\.env.example backend\.env
Copy-Item frontend\.env.example frontend\.env
# 3. Edit backend\.env: set JWT_SECRET to a long random string.
#    Atlas users: paste your Atlas connection string into MONGODB_URI.
npm run install:all
npm run dev
```
Open http://localhost:5173, register a student, refresh the page and log out/in to confirm the data persists.

## Feed and moderation
Students can publish text and JPEG/PNG/WebP images up to 5 MB, edit/delete their posts, like posts, comment, save posts, search the feed, share links, and report inappropriate content. Uploads are signature-checked and stored under `backend/uploads/` (excluded from git). Reports are available to accounts with the `admin` role; assign this role directly through trusted database administration, never through public registration or profile editing.

## Notifications
Notifications are stored in MongoDB, scoped to their recipient, shown in the authenticated notification bell and paginated history, and delivered live to the recipient's authenticated Socket.IO user room. Post likes and comments are wired now. Connection, messaging, and event modules are not present yet; their backend handlers should call `createNotification` from `backend/src/services/notificationService.js` after the action is saved. Use the corresponding type (`connection_request`, `connection_accepted`, `new_message`, `event_announcement`, or `event_update`), set the recipient from the persisted action, and use `resourceType`/`resourceId` to link to its profile, conversation, or event.

Run backend tests (uses an in-memory MongoDB; first run downloads a MongoDB binary, so internet is needed once):
```powershell
npm test
```

## Phase checklist
- [x] Phase 1: structure, DB connection, Helmet/CORS/rate-limit, central error handler, layout
- [x] Phase 2: register/login/me, JWT, profiles (view/edit), student search + suggestions, auth tests
- [x] Phase 3: paginated searchable feed, image posts, likes, comments, bookmarks, and report review
- [x] Notifications: persistent history, unread state, recipient-authorized APIs, real-time Socket.IO delivery, and post like/comment alerts
- [ ] Phase 4: connections + recommendations (Connection model)
- [ ] Phase 5: Socket.IO messaging (Conversation, Message)
- [ ] Phase 6: events + registrations
- [ ] Phase 7: projects + join requests
- [ ] Phase 8: opportunities board
- [ ] Phase 9: dashboard API, global search, responsive polish
- [ ] Phase 10: more tests, seed data, docs (docs/ and database/ folders hold only placeholders so far)
