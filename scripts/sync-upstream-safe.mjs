#!/usr/bin/env node

import { spawnSync } from "node:child_process";

function timestamp() {
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(now.getUTCDate()).padStart(2, "0");
  const hh = String(now.getUTCHours()).padStart(2, "0");
  const min = String(now.getUTCMinutes()).padStart(2, "0");
  const ss = String(now.getUTCSeconds()).padStart(2, "0");
  return `${yyyy}${mm}${dd}-${hh}${min}${ss}`;
}

function printUsage() {
  console.log(
    [
      "Usage: node scripts/sync-upstream-safe.mjs [options]",
      "",
      "Safe upstream sync workflow for forks.",
      "",
      "Options:",
      "  --base <branch>          Base branch to sync (default: main)",
      "  --upstream-ref <ref>     Upstream ref to merge (default: upstream/main)",
      "  --branch <name>          Sync branch name (default: sync/upstream-<utc-timestamp>)",
      "  --allow-dirty            Skip clean-worktree check",
      "  --with-tests             Run OPENCLAW_TEST_PROFILE=low OPENCLAW_TEST_SERIAL_GATEWAY=1 pnpm test",
      "  --runtime-checks         Run cron/heartbeat runtime checks via pnpm openclaw",
      "  --promote                Fast-forward merge sync branch into --base",
      "  --push                   Push origin/<base> after --promote",
      "  --skip-install           Skip pnpm install",
      "  --skip-build             Skip pnpm build",
      "  --skip-check             Skip pnpm check",
      "  -h, --help               Show this help",
      "",
      "Examples:",
      "  node scripts/sync-upstream-safe.mjs --with-tests --runtime-checks",
      "  node scripts/sync-upstream-safe.mjs --promote --push",
    ].join("\n"),
  );
}

function run(cmd, args, opts = {}) {
  const rendered = [cmd, ...args].join(" ");
  console.log(`\n$ ${rendered}`);
  const result = spawnSync(cmd, args, {
    stdio: "inherit",
    env: opts.env ?? process.env,
  });
  if (result.status !== 0) {
    throw new Error(`Command failed (${result.status ?? "unknown"}): ${rendered}`);
  }
}

function capture(cmd, args) {
  const result = spawnSync(cmd, args, {
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf8",
  });
  if (result.status !== 0) {
    const stderr = (result.stderr ?? "").trim();
    throw new Error(stderr || `Command failed (${result.status ?? "unknown"}): ${cmd}`);
  }
  return String(result.stdout ?? "");
}

function refExists(ref) {
  const result = spawnSync("git", ["rev-parse", "--verify", "--quiet", ref], { stdio: "ignore" });
  return result.status === 0;
}

function parseArgs(argv) {
  const options = {
    baseBranch: "main",
    upstreamRef: "upstream/main",
    branch: `sync/upstream-${timestamp()}`,
    allowDirty: false,
    withTests: false,
    runtimeChecks: false,
    promote: false,
    push: false,
    skipInstall: false,
    skipBuild: false,
    skipCheck: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "-h" || arg === "--help") {
      printUsage();
      process.exit(0);
    }
    if (arg === "--base") {
      options.baseBranch = argv[++i] ?? "";
      continue;
    }
    if (arg === "--upstream-ref") {
      options.upstreamRef = argv[++i] ?? "";
      continue;
    }
    if (arg === "--branch") {
      options.branch = argv[++i] ?? "";
      continue;
    }
    if (arg === "--allow-dirty") {
      options.allowDirty = true;
      continue;
    }
    if (arg === "--with-tests") {
      options.withTests = true;
      continue;
    }
    if (arg === "--runtime-checks") {
      options.runtimeChecks = true;
      continue;
    }
    if (arg === "--promote") {
      options.promote = true;
      continue;
    }
    if (arg === "--push") {
      options.push = true;
      continue;
    }
    if (arg === "--skip-install") {
      options.skipInstall = true;
      continue;
    }
    if (arg === "--skip-build") {
      options.skipBuild = true;
      continue;
    }
    if (arg === "--skip-check") {
      options.skipCheck = true;
      continue;
    }
    throw new Error(`Unknown option: ${arg}`);
  }

  if (!options.baseBranch.trim()) {
    throw new Error("--base cannot be empty");
  }
  if (!options.upstreamRef.trim()) {
    throw new Error("--upstream-ref cannot be empty");
  }
  if (!options.branch.trim()) {
    throw new Error("--branch cannot be empty");
  }
  if (options.push && !options.promote) {
    throw new Error("--push requires --promote");
  }

  return options;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const baseRemoteRef = `origin/${options.baseBranch}`;

  if (!options.allowDirty) {
    const status = capture("git", ["status", "--porcelain"]).trim();
    if (status.length > 0) {
      throw new Error(
        "Working tree is dirty. Commit or stash your changes first, or rerun with --allow-dirty.",
      );
    }
  }

  const remotes = capture("git", ["remote"]).split(/\r?\n/).map((s) => s.trim());
  if (!remotes.includes("origin")) {
    throw new Error("Missing git remote: origin");
  }
  if (!remotes.includes("upstream")) {
    throw new Error("Missing git remote: upstream");
  }

  run("git", ["fetch", "--all", "--prune"]);

  if (!refExists(baseRemoteRef)) {
    throw new Error(`Base remote ref not found: ${baseRemoteRef}`);
  }
  if (!refExists(options.upstreamRef)) {
    throw new Error(`Upstream ref not found: ${options.upstreamRef}`);
  }
  if (refExists(`refs/heads/${options.branch}`)) {
    throw new Error(`Local branch already exists: ${options.branch}`);
  }

  run("git", ["switch", "-c", options.branch, baseRemoteRef]);
  run("git", ["merge", "--no-ff", "--no-edit", options.upstreamRef]);

  if (!options.skipInstall) {
    run("pnpm", ["install"]);
  }
  if (!options.skipBuild) {
    run("pnpm", ["build"]);
  }
  if (!options.skipCheck) {
    run("pnpm", ["check"]);
  }
  if (options.withTests) {
    run("pnpm", ["test"], {
      env: {
        ...process.env,
        OPENCLAW_TEST_PROFILE: "low",
        OPENCLAW_TEST_SERIAL_GATEWAY: "1",
      },
    });
  }
  if (options.runtimeChecks) {
    run("pnpm", ["openclaw", "cron", "status"]);
    run("pnpm", ["openclaw", "cron", "list"]);
    run("pnpm", ["openclaw", "system", "heartbeat", "last"]);
  }

  if (options.promote) {
    run("git", ["switch", options.baseBranch]);
    run("git", ["merge", "--ff-only", options.branch]);
    if (options.push) {
      run("git", ["push", "origin", options.baseBranch]);
    }
  }

  console.log("\nSync complete.");
  console.log(`sync branch: ${options.branch}`);
  if (!options.promote) {
    console.log(`promote: git switch ${options.baseBranch}`);
    console.log(`promote: git merge --ff-only ${options.branch}`);
    console.log(`push:    git push origin ${options.baseBranch}`);
  }
}

try {
  main();
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`\nERROR: ${message}`);
  process.exit(1);
}
