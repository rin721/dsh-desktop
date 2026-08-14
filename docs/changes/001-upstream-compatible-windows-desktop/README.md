# Upstream-compatible Windows desktop

English | [中文](README.zh.md)

## Scope

This change record defines a Windows desktop distribution for DeepSeek Harness that preserves the upstream repository as an unmodified, replaceable dependency while providing an installed application, a dedicated window, lifecycle supervision, packaging, and an evidence-driven upstream update path.

The primary track uses a separate desktop companion repository and the exact official `@deepseek-ai/dsh` npm release. An optional upstream contribution may later replace the compatibility supervisor with a small supported process-control contract, but it is not a prerequisite for the first desktop release.

## Status

Status: proposed and awaiting implementation confirmation.

This directory is a plan only. It does not authorize application code changes, dependency installation, packaging, signing, publishing, or changes to the upstream DeepSeek Harness runtime.

## Reading order

1. Read [requirements.md](requirements.md) for goals, boundaries, constraints, non-goals, and acceptance criteria.
2. Read [design.md](design.md) for the verified baseline, target architecture, interfaces, data flow, update model, failure semantics, and validation strategy.
3. Read [tasks.md](tasks.md) for stable task IDs, estimates, dependencies, confirmation state, evidence, commits, and residual risks.

## Documentation placement

This change directory owns the proposed work and its execution evidence. It deliberately does not rewrite current-state topic documentation before the desktop application exists.

After implementation is accepted and verified, the implementation change must update [architecture.md](../../architecture.md), [development.md](../../development.md), and the relevant subsystem pages such as [web-server.md](../../subsystems/web-server.md) so that shipped behavior has one durable home. Any architectural decision introduced by implementation must also be recorded through the repository's Agent Note process rather than turning this task record into permanent current-state documentation.
