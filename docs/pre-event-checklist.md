# Substrate — Pre-Event Checklist

> **Hackathon rule**: "Built entirely during the event; no previous work is allowed."
>
> Tonight (May 1) and Saturday morning before 10:30 AM are for **environment, accounts, and reading only**. **No code. No data. No project files.**
>
> If something requires writing code or scaffolding, it goes on Saturday morning's list, not tonight's.

---

## 1. Tonight (May 1) — by 11 PM

### 1.1 Confirm hackathon eligibility — TEAM (10 min)

- [ ] All 4 team members registered for the hackathon on Cerebral Valley
- [ ] At least one team member confirmed to attend **MongoDB.local London on May 7** *(required for finalist eligibility — without this, you cannot win prizes)*
- [ ] Team Discord channel created; all 4 members in it
- [ ] All 4 members in the **MongoDB Agentic Evolution Hackathon Discord**

### 1.2 Atlas Sandbox access — PERSON A (15 min)

- [ ] Sandbox invitation email received (check spam if not)
- [ ] Click sandbox link → can log into the dedicated MongoDB hackathon Atlas org
- [ ] Verify the cluster is created and you can see it (do NOT load data yet)
- [ ] Get the connection string format ready (you'll fill in credentials Saturday)
- [ ] Atlas user with read/write to the sandbox DB created (note the username)
- [ ] IP allowlist set to `0.0.0.0/0` for the hackathon (sandbox-permitted)

### 1.3 AWS access — PERSON B (30 min, MOST TIME-SENSITIVE)

- [ ] All 4 members have AWS console access (or shared root credentials in 1Password)
- [ ] **Request Bedrock model access** for:
  - [ ] `anthropic.claude-haiku-4-5` (Resolver)
  - This **must be done tonight** — approval can take hours, and without it you cannot use AWS Bedrock tomorrow
- [ ] Region picked: `us-east-1` or `eu-west-2` (London) — pick whichever has the lowest Bedrock latency
- [ ] AWS CLI installed and configured locally (for verification commands; SDK does the actual work)
- [ ] (Optional) S3 bucket name reserved for synthetic dataset (`substrate-demo-<your-handle>`)

> **No App Runner.** Backend runs locally on the demo laptop. AWS-as-core is satisfied by Bedrock + S3.

### 1.4 API keys — TEAM (15 min)

Collect into 1Password / shared vault. **Do NOT commit to repo.**

- [ ] **Voyage AI** — sign up + get API key (sponsor; free credits)
- [ ] **Anthropic API** — backup if Bedrock approval delays (sponsor partner)
- [ ] **LangSmith** — sign up + get API key + add credit card (won't be charged, just to display sponsor credits)
- [ ] **Fireworks AI** — optional fallback inference (sponsor credit)
- [ ] **ElevenLabs** — only if chasing the bonus track (1 month free Creator tier per participant included)

> **No Vercel.** The dashboard runs locally on the demo laptop via `npm run dev`.

### 1.5 GitHub repo — PERSON D (5 min)

- [ ] Org or personal namespace decided
- [ ] Empty public repo created — name: `substrate` (or alternative locked tonight)
- [ ] **Repo contains only an empty README.md** — no code, no .gitignore beyond a stub, no scaffolding
- [ ] All 4 team members invited as collaborators
- [ ] Public visibility confirmed *(rules require public repo)*

### 1.6 Local environment — PER ROLE (30 min)

Each member, on their own laptop:

#### Everyone
- [ ] **Node 20+** installed (`node --version`)
- [ ] **npm 10+** installed
- [ ] **Git** configured with name + email
- [ ] **VS Code** or your editor of choice
- [ ] **Claude Code** CLI installed (you'll need it tomorrow for the demo)

#### Person A (Data)
- [ ] **MongoDB Compass** installed
- [ ] Can connect to a test Atlas cluster (try sandbox in dry-run mode if not blocked)

#### Person B (Backend)
- [ ] **AWS CLI** installed and configured
- [ ] Browser bookmarked: Bedrock console, MongoDB Atlas console

#### Person C (Agents)
- [ ] **Claude Code** CLI installed and verified working — you'll be running TWO concurrent instances tomorrow
- [ ] Browser bookmarked: MCP TS SDK docs, Claude Code MCP docs

#### Person D (Frontend)
- [ ] **OBS** or **QuickTime** ready for video recording
- [ ] Browser: Chrome or Firefox latest

### 1.7 Reading list — PER ROLE (60 min)

#### Person A — Data
- [ ] [MongoDB Atlas Vector Search docs](https://www.mongodb.com/docs/atlas/atlas-vector-search/vector-search-overview/) — `$vectorSearch` aggregation stage and index definition format
- [ ] [`$graphLookup` operator docs](https://www.mongodb.com/docs/manual/reference/operator/aggregation/graphLookup/)
- [ ] [Voyage AI quickstart](https://docs.voyageai.com/docs/embeddings) — confirm `voyage-3` is current best, 1024 dim, batch limit
- [ ] [Atlas Change Streams overview](https://www.mongodb.com/docs/manual/changeStreams/) (so you know what B will subscribe to)

#### Person B — Backend / MCP
- [ ] [MCP TypeScript SDK quickstart](https://github.com/modelcontextprotocol/typescript-sdk) — focus on **HTTP transport** (server side)
- [ ] [AWS Bedrock InvokeModel docs](https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_InvokeModel.html)
- [ ] [MongoDB driver for Node — Change Streams](https://www.mongodb.com/docs/drivers/node/current/usage-examples/changeStream/)
- [ ] Skim MCP "Tools" specification (just enough to know how server registers tools)

#### Person C — Agents (Claude Code instances)
- [ ] [Claude Code MCP configuration docs](https://docs.claude.com/en/docs/claude-code/mcp) — focus on `.mcp.json` file format and HTTP transport
- [ ] How to run **two concurrent Claude Code sessions** in different working directories
- [ ] Skim MCP TS SDK *client* side concepts (Claude Code is the client)
- [ ] Note: NOT building LangGraph — Claude Code is the agent

#### Person D — Frontend
- [ ] [react-flow quickstart](https://reactflow.dev/learn) — focus on custom nodes, custom edges, and **`parentNode` for nested children** (files inside services)
- [ ] [Next.js App Router fundamentals](https://nextjs.org/docs/app) (skip if already familiar)
- [ ] [shadcn/ui CLI usage](https://ui.shadcn.com/docs/installation/next)
- [ ] [framer-motion basics](https://www.framer.com/motion/animation/) — `initial`/`animate`/`exit` and `AnimatePresence`

### 1.8 Internalize the plan — TEAM (20 min)

Each member reads:

- [ ] `frontend-spec.md` — at least skim
- [ ] `backend-spec.md` — at least skim
- [ ] `dataset-spec.md` — at least skim
- [ ] `integration-contract.md` — **read fully, all 4 members**

This last one is the contract everyone is held to. Misreads here cause integration fires.

### 1.9 The "no code" check — TEAM (5 min)

Before bed, verify nothing forbidden has been built:

- [ ] GitHub repo is empty (only README)
- [ ] No data files generated locally
- [ ] No package.json / Next.js scaffold / `.mcp.json` for Substrate anywhere on team machines
- [ ] No Atlas collections created (just the empty cluster)
- [ ] No AWS resources created (other than IAM/Bedrock model access)

If any of these have content, **delete it** and treat tonight as setup-only.

---

## 2. Saturday morning (May 2) — before 10:30 AM kickoff

### 2.1 At home before leaving (8:00–8:30 AM)

- [ ] Charged laptop + charger
- [ ] Phone with hotspot capability (Wi-Fi backup — critical, Atlas is cloud)
- [ ] Headphones (for individual focus during build)
- [ ] Water bottle
- [ ] Snacks (breakfast provided but build through lunch likely)
- [ ] 1Password / API keys accessible

### 2.2 At venue (9:00–10:00 AM, doors open + breakfast)

- [ ] Sign in at front desk
- [ ] Connect to **CodeNode** Wi-Fi (password: `EnterSpace.`)
- [ ] **Bandwidth check**: download a 50MB file to verify speed
- [ ] **Phone hotspot test**: connect laptop, verify Bedrock + Atlas reachable (Wi-Fi flake during demo = no MongoDB)
- [ ] All 4 team members co-located at one table
- [ ] Power strip / extra outlet identified
- [ ] **Identify which laptop will run the demo** — this is the one with: backend + dashboard + two Claude Code instances. Pick the most powerful + most reliable.

### 2.3 Sanity-check before kickoff (10:00–10:30 AM)

Run these on each role's machine — no code yet, just verify connectivity:

```bash
# Everyone
node --version              # ≥ 20
git --version
claude --version            # Claude Code CLI installed

# Person A
mongosh "$ATLAS_CONN_STRING" --eval "db.runCommand({ping: 1})"
# expect: { ok: 1 }

curl -X POST https://api.voyageai.com/v1/embeddings \
  -H "Authorization: Bearer $VOYAGE_KEY" \
  -d '{"input":"hello","model":"voyage-3"}'
# expect: 1024-dim vector

# Person B
aws sts get-caller-identity
aws bedrock-runtime invoke-model \
  --model-id anthropic.claude-haiku-4-5 \
  --body '{"messages":[{"role":"user","content":"hi"}],"max_tokens":10,"anthropic_version":"bedrock-2023-05-31"}' \
  --region us-east-1 \
  /tmp/bedrock-test.json && cat /tmp/bedrock-test.json
# expect: a response, not AccessDenied

# Person C
# Confirm two concurrent Claude Code sessions work:
#   Open two terminals, run `claude` in each from different directories
#   Both should start without conflict
```

If any check fails, **fix before 10:30**, not during build hours.

---

## 3. The 10:30 AM start signal

When the kickoff ends and hacking begins:

- [ ] **All 4** members sit together; first 30 min is no-laptop architecture lock
- [ ] Read `integration-contract.md` §2 (naming) out loud as a team
- [ ] **Decide HTTP MCP vs stdio fallback** by 11:00 (per `integration-contract.md` §9)
- [ ] Each role confirms their first hour's plan from their spec
- [ ] First commits land between 10:35–11:00 (proves "built during event")
- [ ] Repo gets a `LICENSE` (MIT or Apache-2.0) so it's properly open source

---

## 4. What can go wrong tonight (and how to mitigate)

| Problem | Mitigation |
|---------|-----------|
| Atlas sandbox link missing or broken | Email [blerta@cerebralvalley.ai](mailto:blerta@cerebralvalley.ai) ASAP; ping `@CV` on Discord |
| Bedrock model access denied | Submit access request now; have Anthropic API as backup. Plan still works, just weaker AWS-as-core story |
| AWS account blocked or IAM mess | Use a single member's personal AWS account if needed; document it for the demo |
| Voyage rate limit on signup | Use Anthropic embeddings as fallback (would require dim change in spec) |
| GitHub repo limits or org issues | Use a personal account; visibility is what matters |
| One team member can't make MongoDB.local May 7 | **Resolve tonight** — find a substitute or accept losing finalist eligibility |
| Claude Code CLI install fails | Get it working tonight; a Claude Code-driven demo can't run without two working instances |
| Voyage's `voyage-3` deprecated by hackathon date | Check the dashboard; use the latest 1024-dim model. Update `dataset-spec.md` and `integration-contract.md` if so |

---

## 5. Tomorrow's anti-temptations

Things you'll be tempted to do tomorrow that will sink you. Pre-commit to NOT doing them:

- ❌ Adding LiveKit, NemoClaw, Fireworks, or other sponsor integrations mid-build
- ❌ "Quickly" rewriting a working component because you don't like it
- ❌ Adding authentication "just to be safe"
- ❌ Trying to make the synthetic repo actually compile
- ❌ Building a settings page
- ❌ Polishing visuals before the live demo path works end-to-end
- ❌ Continuing to build past 15:30
- ❌ Using a slide deck (judges explicitly forbid presentations)
- ❌ Adding scripted scenes back into the backend (the demo is live agents)
- ❌ Deploying to AWS App Runner or Vercel (everything runs local)

---

## 6. The final tonight checklist (do not sleep with any of these unchecked)

- [ ] All 4 team members can log into the Atlas sandbox
- [ ] Bedrock model access requests submitted (Haiku at minimum)
- [ ] Empty public GitHub repo exists
- [ ] All 4 members have read `integration-contract.md`
- [ ] At least one team member confirmed for MongoDB.local May 7
- [ ] All API keys in shared 1Password
- [ ] Claude Code CLI installed and verified on Person C's machine + the demo laptop
- [ ] Local environments (Node 20, MongoDB Compass) verified per machine
- [ ] Team Discord pinned with the 5 spec docs
- [ ] Phone hotspot tested
- [ ] Demo laptop identified

If any item is unchecked, fix it before bed. Saturday is too compressed for tonight's failures to bleed in.

---

## 7. Day-of contact list

Fill in tonight:

```
Person A (Data):       _________  Phone: _________
Person B (Backend):    _________  Phone: _________
Person C (Agents):     _________  Phone: _________
Person D (Frontend):   _________  Phone: _________

Cerebral Valley contact: blerta@cerebralvalley.ai
Discord: @CV in #questions
Venue: CodeNode, 10 South Pl, London EC2M 7EB
Wi-Fi: CodeNode / EnterSpace.
```
