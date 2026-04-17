# Nutidens Mester

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | React 19 |
| Language | TypeScript 5 |
| Build tool | Vite 6 |
| Styling | Tailwind CSS 4 |
| Authentication | AWS Amplify 6 + AWS Cognito |

## Project Structure

```
src/
├── main.tsx               # Entry point
├── index.css              # Tailwind import
├── aws-config.ts          # Amplify/Cognito configuration
├── App.tsx                # Auth state management
└── components/
    ├── LoginPage.tsx      # Login form + forced password reset flow
    └── WelcomePage.tsx    # Post-login welcome screen
```

## Authentication Flow

1. User enters username and password
2. If the account has a temporary password, a password reset dialog is shown — the user must supply an email address and a new permanent password
3. On success, the welcome page is displayed
4. Cognito credentials are read from `.env.local` (see below)

## Getting Started

1. Copy `.env.local` and fill in your Cognito values:

```
VITE_COGNITO_USER_POOL_ID=
VITE_COGNITO_USER_POOL_CLIENT_ID=
VITE_COGNITO_IDENTITY_POOL_ID=
```

2. Install dependencies and start the dev server:

```bash
npm install
npm run dev
```
