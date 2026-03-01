#!/usr/bin/env node

import { spawnSync } from "node:child_process";

const DOCKER_COMPOSE_SERVICE = "openclaw-gateway";

const FATAL_PATTERNS = [
  /\bfatal\b/i,
  /unhandledRejection/,
  /\bEACCES\b/,
  /\bEADDRINUSE\b/,
  /Cannot find module/,
];

const TELEGRAM_PATTERN = /\[telegram\].*starting provider/i;

function capture(cmd, args, opts = {}) {
  const result = spawnSync(cmd, args, {
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf8",
    env: { ...process.env, MSYS_NO_PATHCONV: "1", ...opts.env },
  });
  return {
    ok: result.status === 0,
    stdout: String(result.stdout ?? ""),
    stderr: String(result.stderr ?? ""),
  };
}

function pad(label, width = 30) {
  const dots = Math.max(1, width - label.length);
  return `${label} ${".".repeat(dots)}`;
}

function main() {
  const results = [];
  let logs = "";

  // ── 1/5 Docker engine ──────────────────────────────────────────────
  {
    const label = "Docker engine";
    const res = capture("docker", ["info"]);
    if (res.ok) {
      results.push({ n: 1, label, status: "PASS", detail: "" });
    } else {
      results.push({ n: 1, label, status: "FAIL", detail: "Start Docker Desktop" });
      // No point continuing if Docker itself is down
      printResults(results);
      process.exit(1);
    }
  }

  // ── 2/5 Gateway container running ──────────────────────────────────
  {
    const label = "Gateway container";
    const res = capture("docker", ["compose", "ps", "--format", "json", DOCKER_COMPOSE_SERVICE]);
    if (!res.ok) {
      results.push({ n: 2, label, status: "FAIL", detail: "docker compose ps failed" });
    } else {
      // docker compose ps --format json outputs one JSON object per line
      const lines = res.stdout.trim().split(/\r?\n/).filter(Boolean);
      let running = false;
      for (const line of lines) {
        try {
          const obj = JSON.parse(line);
          if (obj.State === "running" || obj.Status?.startsWith("Up")) {
            running = true;
            break;
          }
        } catch {
          // not JSON, skip
        }
      }
      if (running) {
        results.push({ n: 2, label, status: "PASS", detail: "" });
      } else {
        results.push({ n: 2, label, status: "FAIL", detail: "container is not running" });
      }
    }
  }

  // Fetch logs once for checks 3 and 5
  {
    const res = capture("docker", ["compose", "logs", "--tail", "100", DOCKER_COMPOSE_SERVICE]);
    logs = res.ok ? res.stdout : "";
  }

  // ── 3/5 Gateway logs (no fatal errors) ─────────────────────────────
  {
    const label = "Gateway logs (no errors)";
    if (!logs) {
      results.push({ n: 3, label, status: "FAIL", detail: "could not read logs" });
    } else {
      const matches = [];
      for (const line of logs.split(/\r?\n/)) {
        for (const pat of FATAL_PATTERNS) {
          if (pat.test(line)) {
            matches.push(line.trim().slice(0, 120));
            break;
          }
        }
      }
      if (matches.length === 0) {
        results.push({ n: 3, label, status: "PASS", detail: "" });
      } else {
        results.push({
          n: 3,
          label,
          status: "FAIL",
          detail: `${matches.length} error(s) found`,
          extra: matches.slice(0, 5),
        });
      }
    }
  }

  // ── 4/5 Cron jobs loaded ───────────────────────────────────────────
  {
    const label = "Cron jobs loaded";
    // Discover the running container name dynamically
    const nameRes = capture("docker", [
      "compose",
      "ps",
      "--format",
      "{{.Name}}",
      DOCKER_COMPOSE_SERVICE,
    ]);
    const containerName = nameRes.stdout.trim().split(/\r?\n/)[0]?.trim();
    if (!containerName) {
      results.push({ n: 4, label, status: "FAIL", detail: "cannot resolve container name" });
    } else {
      const res = capture("docker", [
        "exec",
        containerName,
        "node",
        "dist/index.js",
        "cron",
        "list",
      ]);
      if (!res.ok) {
        results.push({ n: 4, label, status: "FAIL", detail: "cron list command failed" });
      } else {
        // Count non-empty, non-header lines that look like job entries
        const lines = res.stdout.trim().split(/\r?\n/).filter(Boolean);
        // The first line is typically a header; count data rows
        const jobCount = Math.max(0, lines.length - 1);
        if (jobCount > 0) {
          results.push({
            n: 4,
            label,
            status: "PASS",
            detail: `${jobCount} job${jobCount !== 1 ? "s" : ""}`,
          });
        } else {
          results.push({ n: 4, label, status: "FAIL", detail: "no jobs found" });
        }
      }
    }
  }

  // ── 5/5 Telegram provider started ──────────────────────────────────
  {
    const label = "Telegram provider";
    if (!logs) {
      results.push({ n: 5, label, status: "WARN", detail: "no logs to scan" });
    } else {
      const found = logs.split(/\r?\n/).some((line) => TELEGRAM_PATTERN.test(line));
      if (found) {
        results.push({ n: 5, label, status: "PASS", detail: "" });
      } else {
        results.push({ n: 5, label, status: "WARN", detail: "not confirmed" });
      }
    }
  }

  printResults(results);

  const failed = results.filter((r) => r.status === "FAIL").length;
  process.exit(failed > 0 ? 1 : 0);
}

function printResults(results) {
  console.log("");
  for (const r of results) {
    const prefix = `[health] ${r.n}/5 ${pad(r.label)}`;
    const suffix = r.detail ? ` (${r.detail})` : "";
    console.log(`${prefix} ${r.status}${suffix}`);
    if (r.extra) {
      for (const line of r.extra) {
        console.log(`         ${line}`);
      }
    }
  }

  const passed = results.filter((r) => r.status === "PASS").length;
  const failed = results.filter((r) => r.status === "FAIL").length;
  const warned = results.filter((r) => r.status === "WARN").length;
  console.log(`\nHealth: ${passed} passed, ${failed} failed, ${warned} warned.`);
}

try {
  main();
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`\n[health] ERROR: ${message}`);
  process.exit(1);
}
