---
name: openclaw-cli
description: High-level OpenClaw CLI architecture guide. Use when reasoning about CLI responsibilities, execution modes, and operator workflows.
---

# OpenClaw CLI

## Purpose

Use this skill for a design-level understanding of the CLI surface.

## Core Role

The CLI is an operator interface for:
- Controlling local or remote gateway behavior.
- Running diagnostics and operational checks.
- Managing configuration and extension lifecycle.

## High-Level Model

- Command interface layer: what operators invoke.
- Execution layer: local handlers or remote RPC calls.
- Output layer: status, diagnostics, and actionable errors.

## Design Priorities

- Predictability across environments.
- Safe defaults for operational actions.
- Clear visibility into runtime health.

## Boundaries

The CLI orchestrates operations but does not own core domain logic.
Core behavior remains in gateway, agent, and plugin subsystems.

## When To Go Deeper

Go implementation-level when debugging:
- Argument parsing behavior.
- Command registration/loading issues.
- Remote RPC transport/auth errors.
