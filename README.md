# cc-plan

How often does Claude Code use plan mode? Shows session adoption rate, plan cycles per session, monthly trend, and per-project breakdown.

```
cc-plan — Claude Code plan mode usage

  Total sessions:       755
  Sessions w/ plan:     82 (10.9% of sessions)
  Total plan cycles:    610
  Avg per plan session: 7.4 cycles
  Peak in one session:  49

────────────────────────────────────────────────────────
  Plan cycles per session (sessions with plan mode)

  1        ██████████░░░░░░░░░░░░░░    14  (17.1%)
  2-5      ████████████████████████    33  (40.2%)
  6-20     █████████████████████░░░    29  (35.4%)
  21+      ████░░░░░░░░░░░░░░░░░░░░     6  (7.3%)
```

## Usage

```bash
npx cc-plan          # Plan mode usage stats
npx cc-plan --json   # JSON output
```

## What it shows

- **Adoption rate** — percentage of sessions that entered plan mode at least once
- **Plan cycles** — total ExitPlanMode events (each one = Claude presented a plan)
- **Distribution** — single plan vs multi-plan sessions
- **Peak session** — the session with the most plan cycles
- **Monthly trend** — how plan mode usage changes over time
- **By project** — which projects trigger structured planning most

## What counts as a plan cycle?

Each `ExitPlanMode` call represents one complete plan-mode cycle — Claude drafted a plan and presented it for review. A session with 3 ExitPlanMode calls had 3 distinct planning phases.

Sessions with high cycle counts (21+) are typically long exploratory tasks where Claude re-enters plan mode multiple times as the scope evolves.

## Privacy

Scans session files for ExitPlanMode event markers. No content is transmitted. Everything runs locally.

## Browser version

Drop your `~/.claude` folder into [cc-plan on the web](https://yurukusa.github.io/cc-plan/) — no install required.

---

Part of [cc-toolkit](https://yurukusa.github.io/cc-toolkit/) — 60 free tools for Claude Code
