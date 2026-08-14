# Requirements for an upstream-compatible Windows desktop

English | [中文](requirements.zh.md)

## Goal

Deliver a desktop-grade Windows distribution of DeepSeek Harness whose normal update path consumes official upstream releases without editing, copying, or maintaining a fork of the Harness core.

The application must feel like an installed desktop product while preserving the existing web client and Harness runtime as the product implementation. “Desktop” therefore means native installation, windowing, lifecycle, integration, diagnostics, and release management; it does not mean rewriting the React interface in a native UI toolkit.

## In scope

1. A separately versioned desktop companion repository that owns Electron code, the Windows installer, the bundled Node.js runtime, update automation, and desktop-only tests.
2. An exact, lockfile-pinned dependency on the official `@deepseek-ai/dsh` npm release as the primary upstream supply path.
3. A standalone Node.js child process that runs `dsh web` on loopback with an automatically allocated port, keeping Harness native dependencies outside Electron's ABI.
4. A hardened Electron window that loads the supervised local Harness service and blocks unintended navigation, popups, permissions, and renderer access to Node.js.
5. Desktop lifecycle behavior including single-instance activation, startup feedback, clean close, crash reporting without secrets, and prevention of orphaned child processes.
6. A signed, self-contained Windows x64 installer that does not require the user to install Node.js, pnpm, or a browser extension.
7. A repeatable upstream update workflow with compatibility gates, release metadata, rollback, and separate desktop-shell and embedded-Harness version reporting.
8. An optional, separately reviewed upstream contribution that exposes a stable machine-readable readiness and graceful-shutdown contract with minimal CLI-layer changes.

## Constraints

| ID | Constraint |
| --- | --- |
| C-001 | The primary track must not modify files in the DeepSeek Harness source checkout or apply a source patch during ordinary builds. |
| C-002 | Upstream code must enter the product through a traceable official package release and a frozen dependency lock; a source tag or commit build is a documented fallback, not the default. |
| C-003 | The initial supported target is 64-bit Windows 10 and Windows 11; Windows ARM64, macOS, and Linux packaging require separate acceptance work. |
| C-004 | The packaged runtime must bind only to `127.0.0.1`, request an ephemeral port, and never expose Harness on a LAN interface by default. |
| C-005 | The renderer must use `nodeIntegration: false`, `contextIsolation: true`, and `sandbox: true`, with no general-purpose preload bridge. |
| C-006 | The default `$DSH_HOME` or `~/.dsh` behavior must be preserved so CLI, web, and desktop entry points see the same user state unless the user explicitly overrides it. |
| C-007 | Runtime binaries, native modules, notices, and licenses must remain inspectable and packageable outside `app.asar` where execution or compliance requires it. |
| C-008 | Update jobs must verify package integrity, build reproducibly from the committed lockfile, and fail closed when compatibility, signing, or smoke-test evidence is missing. |
| C-009 | Logs and diagnostics must redact credentials, tokens, environment secrets, and sensitive contents under `$DSH_HOME`. |
| C-010 | Application implementation, dependency installation, signing, publishing, and any upstream pull request require explicit confirmation after this plan is reviewed. |

## Non-goals

1. Rewriting the existing React client in WPF, WinUI, Qt, Flutter, or another native UI framework.
2. Replacing the current HTTP and WebSocket transport with Electron IPC in the first release.
3. Loading the full Harness runtime inside Electron's main or renderer process.
4. Maintaining a long-lived fork, copied source tree, or silent patch stack as the normal update model.
5. Adding new Harness product capabilities, changing agent behavior, or redesigning existing web screens.
6. Delivering a background Windows service, multi-user machine installation, Microsoft Store package, or enterprise MSI in the first release.
7. Implementing automatic in-app updates before signed installer upgrades and rollback have been validated manually.
8. Claiming native desktop isolation merely because the browser chrome is removed; the first release intentionally remains a local web application inside a desktop shell.

## Acceptance criteria

| ID | Criterion | Required evidence |
| --- | --- | --- |
| AC-001 | A clean desktop build consumes an exact official `@deepseek-ai/dsh` version without editing or patching the upstream checkout. | Dependency manifest, frozen lockfile, clean upstream `git status`, and build log. |
| AC-002 | Installation and first launch work on a clean supported Windows x64 virtual machine without separately installed Node.js or pnpm. | Recorded clean-VM installation and launch test. |
| AC-003 | Launch opens one dedicated application window, does not open the default browser, hides console windows, and re-focuses the existing window on a second launch. | Automated single-instance test and screen recording or screenshots. |
| AC-004 | The supervised Harness process binds to `127.0.0.1` on an ephemeral port and the chosen URL is learned from a machine-checked readiness signal. | Integration log and socket inspection. |
| AC-005 | Normal window close requests bounded graceful shutdown and leaves no Harness or bundled Node.js process behind; crash and forced-close paths also clean up descendants. | Lifecycle integration tests covering normal close, startup failure, child crash, and parent crash. |
| AC-006 | The packaged client completes the existing web boot path, opens a session, exchanges a streamed response, reloads, and preserves expected `$DSH_HOME` state. | Packaged end-to-end test with an isolated test home. |
| AC-007 | Renderer security settings, navigation restrictions, popup handling, permission denial, content security policy, and loopback origin checks pass automated assertions. | Security test report and inspected Electron configuration. |
| AC-008 | The installer and application executables are signed for production release, include third-party notices, and produce no unexpected SmartScreen or antivirus finding in the release gate. | Signature verification, notice inventory, and release scan result. |
| AC-009 | About and diagnostic views expose the desktop-shell version, exact embedded Harness version, Node.js version, and build identifier without exposing secrets. | UI screenshot and diagnostic snapshot test. |
| AC-010 | An upstream release bump is performed as a reviewable dependency-update change that rebuilds from a frozen lockfile and runs unit, lifecycle, packaged end-to-end, and installer smoke gates. | Successful update pull request and attached gate results. |
| AC-011 | A failed upstream compatibility gate cannot replace the last known-good desktop release, and the prior signed installer remains available for rollback. | Failed-candidate rehearsal and rollback record. |
| AC-012 | Startup, readiness, and shutdown failures present an actionable desktop error page with safe log location and retry or exit actions instead of a blank window. | Failure-injection screenshots and tests. |
| AC-013 | The compatibility supervisor is isolated behind a versioned desktop-owned interface so an accepted upstream supervisor protocol can replace it without changing window or packaging code. | Interface test and dependency diagram review. |
| AC-014 | Current-state Harness documentation is updated only after implementation ships, and the implementation decision is captured through the repository's Agent Note process. | Documentation diff, link checks, and accepted Agent Note. |
