# Contributing to LLM Gateway

Thank you for helping improve LLM Gateway — your contributions make this project stronger.

This document is intended to be a comprehensive, practical, and project-specific guide for contributors. It covers quick setup, development workflows, testing, quality gates, PR expectations, and maintainership guidance tailored to this repository (backend in TypeScript, Next.js UI in `ui/`, PostgreSQL and Redis, Docker-based development).

Table of contents
- Purpose
- Getting started (quick)
- Local development (backend, database, UI)
- Tests and CI
- Linting, formatting, and type checks
- Git workflow, branches, and commit messages
- Pull Request checklist & review guidance
- Reporting bugs & filing feature requests
- Security & responsible disclosure
- Releases, changelog & versioning
- Maintainers and code ownership
- Code of Conduct & license

Purpose
-------
This file explains how to contribute in a way that keeps the project healthy, reviewable, and stable. Follow it to make your changes easier to accept and faster to land.

Getting started (quick)
-----------------------
1. Fork the repository on GitHub.
2. Clone your fork locally:

```bash
git clone https://github.com/furqanahmadrao/LLM-Gateway.git
cd LLM-Gateway
```

3. Install dependencies (we use pnpm in this repo):

```bash
pnpm install
```

4. Start the dev environment (recommended using Docker Compose for full stack):

```bash
docker-compose -f docker-compose.yml -f docker-compose.ui.yml up --build
```

If you prefer to run services locally without Docker, see "Local development" below for the backend/UI steps.

Local development
-----------------
This repository contains two main parts:
- Backend API (root `src/`): Express/Node + TypeScript
- Frontend UI (`ui/`): Next.js + React

Backend (API)
1. Ensure PostgreSQL and Redis are available. Easiest: use the Docker Compose above.
2. Create `.env` from `.env.example` and set DB/Redis connection values and `ENCRYPTION_KEY`.
3. Run database migrations and seed data (script names may vary):

```bash
# run DB migrations (if using node scripts)
pnpm run migrate

# or use the provided script
sh scripts/init-db.sh
```

4. Start the backend in watch mode:

```bash
pnpm run dev
```

UI (Next.js)
1. Install ui dependencies and start the UI dev server:

```bash
cd ui
pnpm install
pnpm dev
```

2. The UI expects the backend to be running at `http://localhost:3000` by default—adjust `.env` values if you changed ports.

Tests and CI
-----------
This repo uses Vitest for unit tests and likely includes some integration tests.

Run tests locally:

```bash
pnpm test
```

Run a watch mode during development:

```bash
pnpm test:watch
```

If you add new functionality, include tests that cover happy-path and key edge cases. Aim for deterministic tests (avoid network calls and time-based flakiness). Use small, focused unit tests and separate integration tests that require services like Postgres/Redis.

Linting, formatting, and type checks
----------------------------------
Keep code consistent and type-safe. Before submitting a PR, run these checks locally:

```bash
pnpm lint      # eslint
pnpm typecheck # tsc --noEmit
pnpm format    # prettier --write
```

If a script above doesn't exist, add it to `package.json` or run the underlying commands directly (e.g., `pnpm exec eslint . --ext .ts,.tsx`).

Git workflow, branches, and commit messages
------------------------------------------
- Work on feature branches off `main` (or `dev` if the project uses one). Branch name convention: `feat/<area>-short-description`, `fix/<area>-short-description`, or `chore/<area>`.
- Rebase your branch on top of the latest `main` before opening a PR.

Commit message style:
- Use the imperative mood: `Add X`, `Fix Y`.
- Optionally use a short scope: `db: add migration for quotas`.
- Keep the subject <= 72 characters and include a descriptive body when needed.

Pull Request checklist & review guidance
---------------------------------------
Before requesting a review, ensure the following:

- [ ] PR targets the correct base branch (usually `main`).
- [ ] Branch is up to date with the base branch (rebase or merge latest `main`).
- [ ] All tests pass locally.
- [ ] Linting and type checks pass.
- [ ] New code has unit tests and, when appropriate, integration tests.
- [ ] Documentation updated (`README.md`, inline comments, API docs).
- [ ] Change is small and focused; prefer multiple small PRs to one very large PR.
- [ ] Screenshots included for UI changes.

Reviewer guidance (how maintainers will review your PR):
- Focus on correctness, clarity, and maintainability.
- Ask for tests when a change touches logic or public APIs.
- Request smaller, focused commits if a PR mixes unrelated changes.

Code review checklist (for reviewers)
- Does the code do what the description claims?
- Are edge cases handled and tested?
- Is the change minimal and consistent with repo style?
- Is the API (internal or external) clearly documented and stable?
- Does the code introduce any security risks (unsafe eval, leaking secrets)?

Reporting bugs & filing feature requests
--------------------------------------
When opening an issue:
- Use a clear, descriptive title.
- Provide a short summary of the problem.
- Environment: Node version, OS, repo commit/hash.
- Steps to reproduce with the smallest possible reproduction.
- Expected vs actual behavior.
- Attach logs, stack traces, screenshots where helpful.

Feature request template
- What problem does this solve?
- Who benefits from this change?
- Proposed API or UX (examples, wireframes, sketches).
- Backwards-compatibility considerations.

Security & responsible disclosure
--------------------------------
If you discover a security vulnerability, do not open a public issue. Instead:

- Email the maintainers at security@your-domain.example (replace with contact)
- If you can't reach maintainers, open a private GitHub security advisory.

Include a clear, minimal reproduction and any logs that demonstrate the issue.

Releases, changelog & versioning
--------------------------------
- Follow Semantic Versioning (MAJOR.MINOR.PATCH).
- Keep a `CHANGELOG.md` or use GitHub Releases for release notes.
- When preparing a release, include migration notes for database changes and any breaking API updates.

Maintainers and code ownership
------------------------------
This repo may have designated maintainers for different areas (backend, UI, infra). If unsure who to ping, add the `**maintainers**` label to your issue or PR and request an assignment.

Large or invasive changes
-------------------------
If you plan to work on a large change (new architecture, major refactor, significant public API change):

1. Open an issue describing high-level goals and design choices.
2. Discuss in the issue with maintainers and get alignment.
3. Work in small, reviewable PRs that implement incremental pieces.

Automation & CI expectations
---------------------------
All PRs must pass the CI pipeline (tests, linting, type checks). If CI is flaky, include an explanation in the PR and link to a follow-up issue to stabilize tests.

Documentation and examples
--------------------------
- Update `README.md` or add docs in a `docs/` directory for features that need more explanation.
- For SDKs or examples, include runnable snippets and expected outputs.

Community & Communication
-------------------------
- Be respectful and patient in reviews and discussions.
- Provide constructive feedback and ask clarifying questions.

Code of Conduct
---------------
This project follows a Code of Conduct. Please read and abide by `CODE_OF_CONDUCT.md`. Be respectful and inclusive.

License
-------
By contributing, you agree your contributions will be licensed under the project's MIT license (see the `LICENSE` file).

Want us to add templates and automation?
-------------------------------------
If you'd like, I can also add:
- `CODE_OF_CONDUCT.md` (Contributor Covenant)
- `.github/ISSUE_TEMPLATE/` and `.github/PULL_REQUEST_TEMPLATE.md`
- `PR_TEMPLATE.md` and `.github/workflows/` CI examples

Thank you for contributing — we look forward to reviewing your changes!

