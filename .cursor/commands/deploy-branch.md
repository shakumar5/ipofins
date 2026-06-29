# Deploy current branch (no merge to main)

1. Commit and `git push origin HEAD` on the feature branch.
2. GitHub Actions → **Build & Deploy** → run workflow on **this branch** (not `main`).
3. Use force export / predeploy flags only when the user requests.
4. **Never merge to `main` from agent sessions.**
