# Nutidens Mester

A web application for tracking who is the current Uno champion in a group of friends or family. After a full round of games (one game per person in the group), the winner of the last game is crowned **Nutidens Mester**. The app supports multiple independent groups, each with their own scoreboard.

---

## How it works

### The game logic
- A **group** has N members (2–10 people).
- A **cycle** is a series of N games — one for each member.
- After each game, any member can open the app and record who won.
- When the N-th game of a cycle is recorded, the winner of that game becomes **Nutidens Mester**.
- A new cycle then starts automatically.

### The app
- Members log in with a username and password.
- Each member can belong to multiple groups.
- Groups are completely isolated — members of one group cannot see another group's data.
- The scoreboard updates in real time when a round is recorded, so everyone sees the result immediately without refreshing.

---

## Architecture overview

The app is split into two parts: a **frontend** (what runs in the browser) and a **backend** (what runs on Amazon's servers).

```
Browser (React app)
      │
      │  HTTPS / WebSocket
      ▼
AWS AppSync  ──────────────►  AWS Lambda  ──────────────►  DynamoDB
(GraphQL API)                 (business logic)             (database)
      │
      │  Authentication
      ▼
AWS Cognito
(user accounts)
```

### Frontend
Built with **React** (the UI framework) and **TypeScript** (a safer version of JavaScript). Styled with **Tailwind CSS**. Built and served by **Vite**.

The frontend uses **AWS Amplify** — a library that handles communication with all the AWS services without requiring manual setup of network requests or authentication headers.

### Backend

| Service | Purpose |
|---|---|
| **AWS Cognito** | Manages user accounts and login. Issues secure tokens (JWTs) that prove who you are. |
| **AWS AppSync** | The GraphQL API — the "front door" to the backend. Receives requests from the browser, checks the Cognito token to verify identity, and routes the request to Lambda. Also handles real-time updates via WebSocket subscriptions. |
| **AWS Lambda** | A function that runs on demand (no server to manage). Contains all the business logic: creating groups, joining groups, recording rounds, and reading data. |
| **AWS DynamoDB** | A NoSQL database that stores all data: groups, memberships, and round results. |

### Infrastructure as code
The backend infrastructure is defined in **Python** using **AWS CDK** (Cloud Development Kit). Instead of clicking through the AWS console to create resources, the CDK code describes exactly what should exist, and AWS builds it automatically. The infrastructure lives in the `infra/` folder.

---

## How a request flows through the system

Understanding this flow makes it much easier to debug and extend the app.

### GraphQL — the language of the API

Every request from the browser is a **GraphQL** operation, which is one of three types:

- **Query** — read data (e.g. "give me my groups")
- **Mutation** — change data (e.g. "create a group", "record a round")
- **Subscription** — listen for live updates (e.g. "tell me when a new round is recorded")

These operations are defined in `infra/lib/schema.graphql`. Adding a new operation means adding it here first.

### Step 1 — Browser sends a request to AppSync

The browser sends the GraphQL operation over HTTPS (or WebSocket for subscriptions). AppSync checks the Cognito token attached to the request to verify the user is logged in. If the token is invalid or missing, the request is rejected before it goes any further.

### Step 2 — AppSync routes to the right data source

AppSync uses **resolvers** to decide what to do with each operation. A resolver maps a GraphQL field to a data source. In this app there are two data sources:

- **Lambda data source** — used for all queries and mutations. AppSync invokes the Lambda function and passes it the operation details.
- **None data source** — used only for the `onRoundAdded` subscription. AppSync handles this entirely itself: when `recordRound` fires, it automatically pushes the result to any connected subscribers. No Lambda is needed because there is no logic to run — AppSync just broadcasts what it already has.

The resolvers are wired up in `infra/nutidens_mester/stack.py`:

```python
# All queries and mutations go to Lambda
lambda_ds = api.add_lambda_data_source("LambdaDs", resolver_fn)
for field_name in ["listMyGroups", "createGroup", "recordRound", ...]:
    lambda_ds.create_resolver(...)

# The subscription is handled by AppSync itself — no Lambda needed
none_ds = api.add_none_data_source("NoneDs")
none_ds.create_resolver("Subscription_onRoundAdded", ...)
```

### Step 3 — Lambda routes to the right function

All queries and mutations land in the same Lambda function (`infra/lambda/index.py`). AppSync tells the Lambda which GraphQL field was called via `event["info"]["fieldName"]`. The Lambda uses a dispatch table to call the right Python function:

```python
dispatch = {
    "listMyGroups":  lambda: list_my_groups(user_id),
    "createGroup":   lambda: create_group(args["name"], args["displayName"], user_id),
    "recordRound":   lambda: record_round(args["groupId"], args["winner"], user_id),
    ...
}
fn = dispatch.get(field_name)
return fn()
```

### Step 4 — Python function reads/writes DynamoDB

The Python functions use **boto3** (the AWS Python SDK) to read and write data in DynamoDB.

For operations that must be atomic (e.g. recording a round updates both the round record and the group's cycle state at the same time), the Lambda uses a **DynamoDB transaction** — either both writes succeed, or neither does.

### Full example: recording a round

1. Browser calls the `recordRound` mutation via Amplify
2. AppSync checks the Cognito token, then invokes Lambda
3. Lambda dispatches to `record_round()`
4. `record_round()` reads the group state from DynamoDB, writes the new round and updates the group in a single transaction
5. AppSync detects that `recordRound` fired and pushes the result to all subscribers of `onRoundAdded`
6. Every other browser viewing that group receives the update in real time

---

## Data model

All data is stored in a single DynamoDB table using a pattern called **single-table design**. Instead of having separate tables for groups, members, and rounds, everything lives in one table. Each item has a `PK` (partition key) and `SK` (sort key) that together uniquely identify the record and encode what type it is.

| Record type | PK | SK | Notes |
|---|---|---|---|
| Group | `GROUP#<id>` | `#META` | Stores cycle state and current mester |
| Membership | `GROUP#<id>` | `MEMBER#<username>` | Also written to GSI1 for reverse lookup |
| Round result | `GROUP#<id>` | `ROUND#00000001\|00000002` | Cycle 1, round 2. Zero-padded so DynamoDB sorts correctly as text |

A **secondary index (GSI1)** with keys `GSI1PK = USER#<username>` and `GSI1SK = GROUP#<id>` allows looking up all groups a user belongs to — the only query that crosses group boundaries.

The **Group** record stores the current cycle state directly (`currentCycleNumber`, `roundsPlayedInCycle`, `mesterName`). When the last round of a cycle is recorded, the Lambda updates these fields atomically together with writing the round record, so the state is never inconsistent.

---

## Project structure

```
NutidensMester/
├── src/                        # Frontend (React + TypeScript)
│   ├── aws-config.ts           # Connects Amplify to Cognito and AppSync
│   ├── App.tsx                 # Top-level routing between pages
│   ├── graphql/
│   │   └── operations.ts       # All GraphQL queries, mutations, subscriptions
│   └── components/
│       ├── LoginPage.tsx       # Login + forced first-time password change
│       ├── GroupsPage.tsx      # List of groups, create group, join group
│       ├── GroupPage.tsx       # Scoreboard, cycle progress, record a round
│       └── AdminPage.tsx       # Admin UI for creating and deleting users
│
├── infra/                      # Backend infrastructure (Python + AWS CDK)
│   ├── app.py                  # CDK entry point
│   ├── requirements.txt        # Python CDK dependencies
│   ├── nutidens_mester/
│   │   └── stack.py            # Defines all AWS resources and wires resolvers
│   ├── lib/
│   │   └── schema.graphql      # GraphQL schema — all types and operations
│   └── lambda/
│       └── index.py            # Single Lambda handling all queries and mutations
│
├── .env.local                  # Secret config values (not committed to git)
└── package.json                # Frontend dependencies
```

---

## Adding a new operation (step by step)

To add a new backend feature, touch these files in order:

1. **`infra/lib/schema.graphql`** — define the new Query or Mutation and its arguments
2. **`infra/nutidens_mester/stack.py`** — add the field name to the resolver loop
3. **`infra/lambda/index.py`** — add it to the dispatch table and write the Python function
4. **`src/graphql/operations.ts`** — add the GraphQL string the frontend will send
5. **Frontend component** — call the operation via Amplify

---

## Environment variables

Stored in `.env.local` (never committed to source control):

```
# Cognito — identifies which user pool handles login
VITE_COGNITO_USER_POOL_ID=
VITE_COGNITO_USER_POOL_CLIENT_ID=
VITE_COGNITO_IDENTITY_POOL_ID=

# AppSync — the URL of the GraphQL API (output from cdk deploy)
VITE_APPSYNC_URL=
VITE_AWS_REGION=eu-central-1
```

---

## Getting started (frontend)

```bash
npm install
npm run dev
```

The app will be available at `http://localhost:5173`.

---

## Deploying the backend

Prerequisites: AWS CLI installed and configured with an SSO profile, and Python 3.12+ installed.

```cmd
:: Log in
aws sso login --profile <your-profile>

:: First time only — create a Python virtual environment and install CDK dependencies
cd infra
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt

:: First deploy only — sets up CDK in your AWS account
set "COGNITO_USER_POOL_ID=<your-user-pool-id>" && set "ADMIN_USERNAME=<your-username>" && npx cdk bootstrap --profile <your-profile>

:: Deploy (activate the venv first if it isn't already)
set "COGNITO_USER_POOL_ID=<your-user-pool-id>" && set "ADMIN_USERNAME=<your-username>" && npx cdk deploy --profile <your-profile>
```

> The `npx cdk` command (from `node_modules`) is still used to run CDK. It invokes `python app.py` internally, which is why the Python venv must be active.

After deploying, copy the `GraphqlUrl` value from the output into `.env.local` as `VITE_APPSYNC_URL`.

---

## Managing users

Users are managed via the in-app **Admin** page, accessible by logging in with the admin account. From there you can create new users (Cognito sends them a temporary password by email) and delete existing users.

Users log in with their username and temporary password. On first login they are prompted to set a permanent password.
