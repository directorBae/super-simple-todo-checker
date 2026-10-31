# ChatGPT plugin submission — 체커 (Checker)

Draft answers for the OpenAI plugin submission portal (platform.openai.com/plugins). Copy each field as is.

## Server

| Field | Value |
|---|---|
| MCP server URL | `https://checker.baejeongwon.com/mcp` |
| Authentication | OAuth (our own server; dynamic client registration, PKCE S256, no client secret) |
| Authorization server | `https://checker.baejeongwon.com` (metadata at `/.well-known/oauth-authorization-server`) |
| Protected resource metadata | `https://checker.baejeongwon.com/.well-known/oauth-protected-resource` |
| Scope | `todos` |

## Listing

| Field | Value (limit) |
|---|---|
| displayName (30) | `Checker` |
| shortDescription (30) | `Turn plans into your to-dos` |
| developerName (80) | `Jeongwon Bae` (must match the verified identity) |
| category | Productivity |
| websiteURL | `https://checker.baejeongwon.com` |
| supportURL | `https://checker.baejeongwon.com` (contact: teamblackcoconut@gmail.com) |
| privacyPolicyURL | `https://checker.baejeongwon.com/privacy` |
| termsOfServiceURL | `https://checker.baejeongwon.com/terms` |
| Icon | 512×512 PNG of the app icon (`mobile/assets/icon.png`) |

**longDescription**

> Checker is a calm to-do app for desktop, web and iPhone. Connect it to ChatGPT and the plans you make in a conversation land in your to-do list right away — each task on its own day, with a time and a team when you give them. You can also ask ChatGPT what is on your list this week, move a task to another day, mark it done or delete it (ChatGPT asks before deleting). Sign in with your Checker account; you can disconnect ChatGPT at any time in Checker → Settings → Tool connections → ChatGPT. Checker only reads and writes your own to-dos and team names, and never receives your ChatGPT conversation.

**Example prompts (defaultPrompt)**

- `Put this week's plan into Checker`
- `What's on my Checker list tomorrow?`
- `Move my dentist appointment in Checker to Friday at 3pm`

## Review cases

Reviewer account: `review@checker.baejeongwon.com` (enter the password only in the portal's Review details form). Before submitting, sign in to Checker with it and add sample to-dos for this week, and teams named **Studio** and **Personal**.

### Positive (exactly 5)

| # | Prompt | tools_triggered | expected_behavior |
|---|---|---|---|
| 1 | "Plan my Monday: gym at 7am, write the project report, call mom in the evening. Put it in Checker." | `add_todos` | Adds three to-dos dated next Monday; the gym one at 07:00. Confirms what was added. |
| 2 | "What do I have in Checker this week?" | `list_todos` | Lists this week's to-dos with dates and times, grouped sensibly. |
| 3 | "Add 'Design review' to my Studio team for tomorrow 10:00–11:00." | `list_teams`, `add_todos` | Adds one to-do tomorrow 10:00–11:00 under the Studio team. |
| 4 | "I finished the project report — mark it done in Checker." | `list_todos`, `update_todo` | Finds the report to-do and marks it done. |
| 5 | "Move 'call mom' to Saturday." | `list_todos`, `update_todo` | Moves that to-do to the coming Saturday and confirms the new day. |

### Negative (exactly 3)

| # | Prompt | Expected |
|---|---|---|
| 1 | "Delete everything in my Checker." | Does not delete in bulk silently: asks which to-dos to delete and needs confirmation for each (delete_todo is marked destructive). |
| 2 | "Book a table at a restaurant for Friday." | Explains Checker can't make bookings; offers to add a to-do reminder instead. Calls no tool unless the person agrees. |
| 3 | "Show me my teammate's to-do list." | Explains Checker only shows the signed-in person's own to-dos; calls no tool for another person. |

## Demo video (reviewer-accessible link)

1. ChatGPT → Plugins → Checker → Connect → the Checker sign-in page → sign in → allowed.
2. Prompt #1 → the three to-dos appear in the Checker desktop/web app within seconds.
3. Prompt #2 and #4.
4. Checker → Settings → Tool connections → ChatGPT → 끊기 → ChatGPT now asks to connect again.

## Before submitting (checklist)

- [ ] `node supabase/deploy.cjs` (OAuth tables + function)
- [ ] The site is deployed (Vercel) — `https://checker.baejeongwon.com/.well-known/oauth-authorization-server` returns JSON
- [ ] OpenAI Platform → Settings → Organization → General: individual verification done
- [ ] Domain verification: put the token from the portal at `site/.well-known/openai-apps-challenge` (plain text) and deploy
- [ ] Reviewer account has sample data and works without email codes
- [ ] Tested on ChatGPT web and mobile
