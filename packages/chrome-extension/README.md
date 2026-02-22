# Better Hub — Chrome Extension

Redirects GitHub URLs to your Better Hub instance.

## Install (Developer Mode)

1. Open `chrome://extensions` in Chrome
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select this folder (`packages/chrome-extension`)

That's it — GitHub pages will now redirect to `http://localhost:3000`.

## Configure

Click the extension icon to:

- **Toggle** redirects on/off
- **Change host** if your Better Hub runs on a different URL

## Route Mappings

| GitHub URL                            | Redirects to                |
| ------------------------------------- | --------------------------- |
| `github.com`                          | `/dashboard`                |
| `github.com/:owner/:repo`             | `/:owner/:repo`             |
| `github.com/:owner/:repo/pull/:n`     | `/:owner/:repo/pull/:n`     |
| `github.com/:owner/:repo/commit/:sha` | `/:owner/:repo/commit/:sha` |
| `github.com/notifications`            | `/notifications`            |
| `github.com/issues`                   | `/issues`                   |
| `github.com/pulls`                    | `/prs`                      |
| `github.com/trending`                 | `/trending`                 |

GitHub-only pages (`/settings`, `/marketplace`, `/login`, etc.) are excluded.
