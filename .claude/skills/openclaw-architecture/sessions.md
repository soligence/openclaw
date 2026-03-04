# Sessions Architecture

## Scope

This document explains how OpenClaw models conversational continuity.

## Role In The System

Sessions define context boundaries for agent reasoning over time.

## Core Concepts

- Session identity: stable key used to associate turns.
- Session scope: main, peer, group/channel, and thread contexts.
- Session state: history plus runtime metadata used for policy and compaction.

## Why Sessions Matter

Session design drives:
- Continuity quality.
- Cross-surface context isolation.
- Cost/latency behavior due to history growth.
- Correctness of multi-thread or multi-group behavior.

## High-Level Session Types

- Long-lived conversational sessions (continuity-focused).
- Isolated run sessions (task-focused, minimal carryover).
- Thread-derived sessions (sub-contexts with parent relationship).

## Architectural Tradeoffs

- More shared context improves continuity but increases bleed risk.
- More isolation improves safety but can reduce recall and coherence.

## Typical Failure Patterns

- Unexpected context carryover across boundaries.
- Missing expected context due to over-isolation.
- Session reset/compaction timing mismatch with user expectations.

## When To Go Deeper

Inspect code/runtime details when you need:
- Exact session key derivation for an event path.
- Parent/child session mapping behavior for threads.
- Compaction and reset trigger logic in a concrete failure.
