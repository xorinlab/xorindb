---
name: agent-skill
description: Guidelines, capabilities, and autonomy standards for autonomous agent development, task execution, and codebase interaction.
---

# Agent Skill

## Purpose
Provides execution standards, context discovery rules, and autonomous workflows for agents operating within the XorinDB project.

## Core Directives
1. **Local-First & Offline First**: All data structures and logic must prioritize zero-latency offline operation and reliable asynchronous sync.
2. **Minimalism & Token Conservation (Ponytail compliant)**: Prefer surgically small diffs, minimal dependencies, and zero unnecessary abstractions.
3. **Knowledge & Code Graph (Graphify compliant)**: Maintain clear architectural boundaries across storage, reactivity, schema, and sync layers.
4. **Reliability & Verification**: Every feature must include automated unit tests using Vitest with full passing verification.
