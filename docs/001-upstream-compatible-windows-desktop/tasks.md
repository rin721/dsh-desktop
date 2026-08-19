# Tasks for an upstream-compatible Windows desktop

English | [中文](tasks.zh.md)

## Execution rule

This registry is the task-level source of truth for the proposed desktop work. Only `DSK-DOC-001` is authorized by the current request. Every implementation, dependency, signing, publishing, and upstream-contribution task remains unconfirmed until the user explicitly approves the reviewed plan.

A material change to the goal, process boundary, update supply path, supervisor contract, supported operating systems, installer type, signing policy, or user-data behavior requires the affected tasks to return to `pending confirmation` before work continues.

## Status legend

| Status | Meaning |
| --- | --- |
| `pending` | Defined but not started. |
| `in progress` | Authorized work has started but its completion evidence is incomplete. |
| `complete` | Completion criteria and required evidence are satisfied. |
| `blocked` | An external decision or dependency prevents meaningful progress. |
| `optional` | Not required for the first release and requires separate confirmation. |

## Task registry

| ID | Work | Estimate | Dependencies | Completion criteria | Confirmation | Status |
| --- | --- | --- | --- | --- | --- | --- |
| DSK-DOC-001 | Create the bilingual requirements, design, task, and index records. | 1 day | None | Twelve paired Markdown and i18n files exist, required sections are present, links and pairing records pass, and validation evidence is recorded. | Confirmed for planning only | `in progress` |
| DSK-DEC-001 | Confirm the primary architecture, release boundary, initial platform, and implementation repository. | 0.5 day | DSK-DOC-001 | User explicitly accepts or revises the independent Electron shell, standalone Node.js runtime, loopback transport, Windows x64 target, and official npm supply path. | Not confirmed | `pending` |
| DSK-GOV-001 | Create and accept a proposed Agent Note for the implementation decision. | 0.5 day | DSK-DEC-001 | The note follows repository policy, records the selected boundary and rejected alternatives, passes documentation gates, and is accepted before Harness source changes. | Not confirmed | `pending` |
| DSK-REP-001 | Create the separately versioned desktop companion repository and CI skeleton. | 1 day | DSK-DEC-001 | Repository ownership, package manager, TypeScript configuration, lint/test gates, Windows CI, version policy, and upstream provenance are documented and green. | Not confirmed | `pending` |
| DSK-DEP-001 | Implement exact upstream package and standalone Node.js runtime staging. | 2 days | DSK-REP-001 | Exact `@deepseek-ai/dsh` version, frozen closure, pinned Node.js version and hashes, production-only resources, notices, and manifest are reproducibly staged. | Not confirmed | `pending` |
| DSK-LCH-001 | Implement the Windows launcher and Job Object containment. | 3 days | DSK-REP-001 | Hidden launch, control-stream forwarding, kill-on-close containment, graceful deadline, forced cleanup, Unicode paths, signing, and descendant tests pass. | Not confirmed | `pending` |
| DSK-SUP-001 | Implement `HarnessProcessSupervisor` and the zero-source compatibility adapter. | 3 days | DSK-DEP-001, DSK-LCH-001 | State machine, version checks, readiness parsing, independent boot probe, private shutdown adapter, redacted diagnostics, retries, and failure injection pass against the exact Harness version. | Not confirmed | `pending` |
| DSK-WIN-001 | Implement the secure Electron desktop window and product lifecycle. | 2 days | DSK-SUP-001 | Single instance, startup/error UI, delayed product window, window restore, exact-origin navigation, external-link policy, close behavior, and version display pass. | Not confirmed | `pending` |
| DSK-SEC-001 | Harden and review the desktop trust boundary. | 2 days | DSK-WIN-001 | Sandbox, context isolation, disabled Node integration, CSP, permission denial, no generic preload API, log redaction, dependency audit, and threat-focused tests pass. | Not confirmed | `pending` |
| DSK-PKG-001 | Build and sign the Windows x64 installer. | 3 days | DSK-DEP-001, DSK-LCH-001, DSK-WIN-001, DSK-SEC-001 | Installed and unpacked artifacts have the intended ASAR boundary, complete runtime closure, signatures, notices, clean uninstall, and no system Node.js dependency. | Not confirmed | `pending` |
| DSK-TST-001 | Establish packaged compatibility and clean-machine acceptance. | 4 days | DSK-PKG-001 | Unit, lifecycle, HTTP/WebSocket stream, native dependency, isolated `$DSH_HOME`, Windows 10/11 clean-VM, upgrade, crash cleanup, antivirus, and uninstall evidence pass. | Not confirmed | `pending` |
| DSK-UPD-001 | Automate official upstream version proposals and rollback-safe promotion. | 2 days | DSK-TST-001 | A bot or scheduled job opens reviewable exact-version candidates, refreshes lock and provenance, runs every gate, blocks failed promotion, and retains the previous signed release. | Not confirmed | `pending` |
| DSK-UP-001 | Propose the minimal versioned supervisor protocol upstream. | 2 days | DSK-GOV-001, DSK-SUP-001 | Maintainer-reviewed protocol emits structured readiness, accepts graceful shutdown, handles parent loss, reuses bounded cleanup, has tests and docs, and introduces no Electron dependency. | Separate confirmation required | `optional` |
| DSK-DOC-002 | Publish verified current-state Harness and desktop documentation. | 1 day | DSK-TST-001, DSK-UPD-001 | Architecture, development, web-server, companion-repository, operations, and release docs describe only shipped behavior, link to accepted decisions, and pass bilingual gates. | Not confirmed | `pending` |
| DSK-REL-001 | Approve and publish the first desktop release. | 1 day | DSK-TST-001, DSK-UPD-001, DSK-DOC-002 | Version manifest, signed installer, provenance, checksums, notices, acceptance report, support boundary, known risks, and rollback artifact receive explicit release approval. | Not confirmed | `pending` |

Estimates are engineering effort ranges, not elapsed-time promises; code-signing identity procurement, upstream review, CI queueing, antivirus reputation, and clean-VM availability are external lead times.

## Proposed execution order

1. Decision round: complete DSK-DOC-001 and obtain DSK-DEC-001 confirmation without changing application code.
2. Foundation round: complete DSK-GOV-001, DSK-REP-001, DSK-DEP-001, and DSK-LCH-001, then demonstrate reproducible process containment before building UI polish.
3. Desktop round: complete DSK-SUP-001, DSK-WIN-001, and DSK-SEC-001, then review the runtime and security evidence.
4. Distribution round: complete DSK-PKG-001, DSK-TST-001, and DSK-UPD-001, including a failed-candidate and rollback rehearsal.
5. Publication round: complete DSK-DOC-002 and DSK-REL-001; pursue DSK-UP-001 independently when upstream contribution is authorized.

## Per-round verification evidence

| Round | Date | Task IDs | Evidence | Result |
| --- | --- | --- | --- | --- |
| R0: repository baseline | 2026-08-14 | DSK-DOC-001 | `git status --short --branch` showed a clean `master` tracking `origin/master`; `docs/changes` did not exist; the remote points to `deepseek-ai/deepseek-harness`; source inspection located the current CLI, web boot, loopback port, readiness line, and bounded shutdown path. | Passed; selected sequence `001` and the primary external-process boundary. |
| R0: package supply | 2026-08-14 | DSK-DOC-001 | `npm view @deepseek-ai/dsh version dist-tags --json` reported the official public package and current release metadata; package inspection confirmed the `dsh` binary entry and official package dependency closure. | Passed as current planning evidence; every implementation and update round must query and pin the then-current exact release again. |
| R0: repository policy | 2026-08-14 | DSK-DOC-001 | Read `AGENTS.md`, `docs/AGENTS.md`, the documentation and prose skills, Agent Note policy, i18n pairing rules, terminology, and translation rules. | Passed; selected a four-document bilingual triplet layout and deferred current-state topic edits until implementation. |
| R1: plan authoring | 2026-08-14 | DSK-DOC-001 | Created the required English and Chinese requirements, design, task, and index documents; pairing records and final documentation gates remain to be recorded. | In progress. |

Future rounds must append evidence rather than replace failed or superseded results. Evidence must name the exact Harness, Node.js, Electron, desktop, installer, and operating-system versions used whenever those versions affect the result.

## Commit ledger

| Task IDs | Commit | Scope | Verification |
| --- | --- | --- | --- |
| DSK-DOC-001 | Not committed | `docs/changes/001-upstream-compatible-windows-desktop/` only | R0 complete; R1 pending final gates. |

No commit, branch push, tag, installer, signature, release, or upstream pull request has been created by this plan. Implementation rounds must add their actual commit identifiers and must not use placeholders as completion evidence.

## Residual risk register

| ID | Risk | Current mitigation | Release gate or owner |
| --- | --- | --- | --- |
| RR-001 | The current human-readable readiness line or signal listener changes in a new Harness release. | Exact version pin, isolated compatibility adapter, independent boot probe, and contract tests on every bump. | DSK-SUP-001 and DSK-UPD-001; prefer DSK-UP-001 when accepted upstream. |
| RR-002 | Job Object launcher or control-stream behavior fails under crashes, antivirus hooks, Unicode paths, or installer locations. | Small signed helper, failure injection, descendant enumeration, clean-VM tests, and forced-timeout verification. | DSK-LCH-001 and DSK-TST-001. |
| RR-003 | A local uncredentialed HTTP/WebSocket service is reachable by another process on the same machine. | Loopback-only ephemeral origin, exact-origin enforcement, short lifecycle, no LAN bind, and adoption of an upstream nonce if available. | DSK-SEC-001; a stronger authentication contract may require upstream work. |
| RR-004 | Native modules or executable assets are missing, quarantined, or incompatible in the packaged dependency closure. | Standalone compatible Node.js, outside-ASAR staging, inventory, signature and antivirus scanning, and native-function E2E tests. | DSK-DEP-001, DSK-PKG-001, and DSK-TST-001. |
| RR-005 | Upstream changes `$DSH_HOME` state in a way an older desktop release cannot read after rollback. | Preserve upstream storage semantics, back up before any approved migration, block promotion on incompatibility, and roll back binaries without silently downgrading data. | DSK-UPD-001 and upstream release review. |
| RR-006 | npm publication, transitive dependency, or registry metadata does not correspond to the expected upstream source. | Record integrity and provenance, freeze the full lockfile, compare package metadata, scan resources, and use a documented source-revision build only as an approved fallback. | DSK-DEP-001 and release review. |
| RR-007 | Code-signing identity, certificate reputation, or antivirus false positives delay production readiness. | Procure identity early, sign candidates consistently, run release scans, and treat unsigned artifacts as internal only. | DSK-PKG-001 and release owner. |
| RR-008 | The companion shell drifts into product logic and becomes a second Harness implementation. | Keep the supervisor interface narrow, forbid renderer privileges and feature duplication, and review file impact on every change. | DSK-DEC-001 and architecture review. |
| RR-009 | Electron or bundled Node.js security support windows expire independently of Harness updates. | Track all three version lines separately, schedule dependency candidates, and block releases with unsupported runtimes. | DSK-UPD-001 and security owner. |
| RR-010 | Plan statements are mistaken for already shipped behavior. | Keep status explicit, leave current-state topic docs unchanged, record actual commits and evidence per round, and update durable docs only under DSK-DOC-002. | DSK-DOC-001 and DSK-DOC-002. |

## Confirmation checkpoint

Before any non-documentation work begins, the user must confirm the primary choice: an independent Electron companion repository, exact official npm dependency, standalone pinned Node.js runtime, loopback HTTP/WebSocket transport, Windows x64 first release, and an optional upstream supervisor contribution that is not required for launch.
