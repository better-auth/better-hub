# Authentication

Better Hub uses the `better-auth` library (built by the same team) for authentication, with GitHub as the sole OAuth provider.

## Key Files

- `apps/web/src/lib/auth.ts` -- Server-side auth configuration and `getServerSession()`
- `apps/web/src/lib/auth-client.ts` -- Client-side auth hooks (`useSession`, `signIn`, `signOut`)
- `apps/web/src/lib/ai-auth.ts` -- Helper to extract Octokit/token for AI routes
- `apps/web/src/lib/auth-plugins/pat-signin.ts` -- Personal Access Token sign-in plugin
- `apps/web/src/lib/github-scopes.ts` -- OAuth scope groups and descriptions
- `apps/web/src/app/api/auth/[...all]/route.ts` -- better-auth catch-all API handler
- `apps/web/src/proxy.ts` -- Middleware with auth checks

## Server Configuration (`auth.ts`)

The `betterAuth()` instance is configured with:

### Database Adapter
```typescript
database: prismaAdapter(prisma, { provider: "postgresql" })
```

### Plugins
- `dash()` -- Dashboard/admin panel with activity tracking
- `sentinel()` -- Rate limiting and abuse protection
- `admin()` -- Admin user management
- `patSignIn()` -- Custom plugin for Personal Access Token authentication
- `stripe()` -- Stripe billing integration (conditional on `STRIPE_SECRET_KEY` being set)
- `oAuthProxy()` -- OAuth proxy for Vercel preview deployments (production URL: `https://www.better-hub.com`)

### GitHub OAuth
```typescript
socialProviders: {
  github: {
    clientId: process.env.GITHUB_CLIENT_ID!,
    clientSecret: process.env.GITHUB_CLIENT_SECRET!,
    scope: ["read:user", "user:email", "public_repo"],
    mapProfileToUser(profile) {
      return { githubLogin: profile.login };
    },
  },
},
```

Default scopes are minimal. Users can opt into additional scopes (private repos, notifications, etc.) through the sign-in UI.

### Session Configuration
```typescript
session: {
  cookieCache: {
    enabled: true,
    maxAge: 60 * 60 * 24 * 7,  // 7 days
    strategy: "jwe",             // JSON Web Encryption
  },
},
```

Sessions are cached in the cookie itself using JWE encryption. This means most auth checks don't require a DB lookup.

### Account Settings
```typescript
account: {
  encryptOAuthTokens: true,      // OAuth tokens encrypted at rest
  storeAccountCookie: true,      // Account data cached in cookie
  updateAccountOnSignIn: true,   // Sync scopes on each sign-in
},
```

### User Fields
Custom fields added to the User model:
- `githubPat` (string, optional) -- Personal Access Token for enhanced API access
- `onboardingDone` (boolean, optional) -- Whether the user completed onboarding

### Trusted Origins
```typescript
trustedOrigins: [
  "https://www.better-hub.com",
  "https://better-hub-*-better-auth.vercel.app",
  "https://beta.better-hub.com",
],
```

## `getServerSession()`

This is the primary function for getting the authenticated user in server components and API routes. It is wrapped in React `cache()` for request deduplication.

```typescript
export const getServerSession = cache(async () => {
  // 1. Get session from better-auth
  // 2. Get GitHub access token
  // 3. Fetch GitHub user data (cached in Redis for 1 hour)
  // 4. Return { user, session, githubUser: { ...githubData, accessToken } }
});
```

Returns `null` if:
- No valid session cookie exists
- The session has expired
- The GitHub access token is invalid

The `$Session` type is exported for use throughout the app:
```typescript
export type $Session = NonNullable<Awaited<ReturnType<typeof getServerSession>>>;
```

## Client-Side Auth (`auth-client.ts`)

```typescript
export const authClient = createAuthClient({
  plugins: [
    inferAdditionalFields<typeof auth>(),
    dashClient(),
    sentinelClient(),
    stripeClient({ subscription: true }),
  ],
});

export const { signIn, signOut, useSession } = authClient;
```

- `useSession()` -- React hook for accessing session state
- `signIn()` -- Initiate GitHub OAuth flow
- `signOut()` -- End the session

## AI Route Auth (`ai-auth.ts`)

Helper functions for AI API routes:

```typescript
// Get an authenticated Octokit client from the session
getOctokitFromSession(): Promise<Octokit | null>

// Get just the GitHub token
getGitHubToken(): Promise<string | null>
```

## Middleware Auth (`proxy.ts`)

The middleware checks authentication before any protected route:

1. Public paths bypass auth: `/`, `/api/auth`, `/api/inngest`
2. All other paths require a valid session cookie (`getSessionCookie(request.headers)`)
3. Missing sessions redirect to `/` (the landing page with sign-in)

## OAuth Scopes

Scopes are defined in `github-scopes.ts` as groups:

| Group | Scopes | Required? |
|---|---|---|
| `profile` | `user`, `user:email`, `user:follow` | Yes |
| `public_repos` | `public_repo`, `repo:status`, `repo_deployment`, `read:org` | Yes |
| `private_repos` | `repo` | No |
| `notifications` | `notifications` | No |
| `gist` | `gist` | No |
| `admin` | `admin:repo_hook`, `admin:org` | No |
| `workflow` | `workflow` | No |
| `delete_repo` | `delete_repo` | No |

Each group has a label, description, and reason shown to the user during scope selection.

## GitHub User Data Caching

When a session is established, the GitHub user profile is fetched and cached:

1. Hash the access token with SHA-256
2. Check Redis for `github_user:{tokenHash}`
3. If miss, call `octokit.users.getAuthenticated()`
4. Cache result in Redis with 1-hour TTL
5. Caching is fire-and-forget via `waitUntil()` to not block the response

## PAT Sign-In

The `patSignIn()` plugin allows users to authenticate with a GitHub Personal Access Token instead of OAuth. This is useful for:
- CI/CD integrations
- Automated testing
- Users who prefer token-based auth
