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
The backend infrastructure is defined in TypeScript using **AWS CDK** (Cloud Development Kit). Instead of clicking through the AWS console to create resources, the CDK code describes exactly what should exist, and AWS builds it automatically. The infrastructure lives in the `infra/` folder.

---

## Data model

All data is stored in a single DynamoDB table using a pattern called **single-table design**. Each item has a `PK` (partition key) and `SK` (sort key) that determine what kind of record it is.

| Record type | PK | SK |
|---|---|---|
| Group | `GROUP#<id>` | `#META` |
| Membership | `GROUP#<id>` | `MEMBER#<username>` |
| Round result | `GROUP#<id>` | `ROUND#<cycle>#<round>` |

A secondary index (GSI1) allows looking up all groups a user belongs to.

The **Group** record stores the current cycle state directly: how many rounds have been played, and who the current Nutidens Mester is. When the last round of a cycle is recorded, the Lambda updates this atomically in a single database transaction.

---

## Project structure

```
NutidensMester/
├── src/                        # Frontend (React app)
│   ├── aws-config.ts           # Connects Amplify to Cognito and AppSync
│   ├── App.tsx                 # Top-level routing between pages
│   ├── graphql/
│   │   └── operations.ts       # All GraphQL queries, mutations, subscriptions
│   └── components/
│       ├── LoginPage.tsx       # Login + forced first-time password change
│       ├── GroupsPage.tsx      # List of groups, create group, join group
│       └── GroupPage.tsx       # Scoreboard, cycle progress, record a round
│
├── infra/                      # Backend infrastructure (AWS CDK)
│   ├── bin/app.ts              # CDK entry point
│   ├── lib/
│   │   ├── stack.ts            # Defines all AWS resources
│   │   └── schema.graphql      # GraphQL API schema (types + operations)
│   └── lambda/
│       └── index.ts            # Lambda function (all resolver logic)
│
├── .env.local                  # Secret config values (not committed to git)
└── package.json                # Frontend dependencies
```

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

Prerequisites: AWS CLI installed and configured with an SSO profile.

```bash
# Log in
aws sso login --profile <your-profile>

# First time only — sets up CDK in your AWS account
cd infra
npm install
set "COGNITO_USER_POOL_ID=<your-user-pool-id>" && npx cdk bootstrap --profile <your-profile>

# Deploy
set "COGNITO_USER_POOL_ID=<your-user-pool-id>" && npx cdk deploy --profile <your-profile>
```

After deploying, copy the `GraphqlUrl` value from the output into `.env.local` as `VITE_APPSYNC_URL`.

---

## Adding users

Users are managed in **AWS Cognito**. To add a new user:

1. Go to **AWS Console → Cognito → User Pools → your pool → Users → Create user**
2. Set a username, email, and temporary password
3. The user will be prompted to set a permanent password on first login
