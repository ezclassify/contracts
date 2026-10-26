# Security Policy

## Supported Versions

| Version | Status             | Security Patches | End of Life |
| ------- | ------------------ | ---------------- | ----------- |
| 1.x     | Active development | Yes              | None        |

Only the latest patch release within each supported major version receives security updates. This policy covers every package published from this repository: `@ezclassify/types`, `@ezclassify/schemas`, `@ezclassify/openapi`, `@ezclassify/conformance`, `@ezclassify/conformance-server`, `@ezclassify/validator`, and `@ezclassify/tsconfig`.

## Reporting a Vulnerability

**Do NOT open a public issue for security vulnerabilities.**

Email **security@ezclassify.com** with the following information:

- Description of the vulnerability and its potential impact.
- Steps to reproduce the issue, including proof-of-concept if possible.
- Affected packages, versions, and configurations.
- Any suggested remediation, if available.

You will receive an acknowledgment within **48 hours**. We follow a **90-day coordinated disclosure** window from the date of the initial report.

## What Is a Security Issue

A security issue is a defect that could be exploited to compromise confidentiality, integrity, or availability. Most of this repository is types, schemas, and data. The code that runs on a user's machine is the validator CLI and the conformance replay server, and the published schemas are what other tools trust to reject a malformed document. Examples include:

- A published schema that accepts raw secret material where it requires a secret reference, or otherwise admits a document shape the contract says must be refused.
- Prototype pollution, object injection, or unsafe YAML handling while the validator reads a document.
- Denial of service through a crafted document or request that causes unbounded memory or CPU use in the validator or the replay server.
- A request that makes the replay server read a file other than its corpus, or the server answering on an interface other than the one it was told to bind.
- A compromised or tampered package distribution path.

The following are **not** security issues and should be filed as regular bugs:

- Incorrect classification results, rollup logic errors, or an access decision you disagree with. Nothing in this repository evaluates a scheme; file them on the [central EzClassify tracker](https://github.com/ezclassify/ezclassify/issues).
- Performance regressions that do not involve unbounded resource consumption.
- Missing validation that does not lead to exploitable behavior.
- Documentation errors.

If you are unsure whether something qualifies, report it to security@ezclassify.com and we will triage it.

## Response Timeline

| Stage                  | Timeline                         |
| ---------------------- | -------------------------------- |
| Acknowledgment         | Within 48 hours                  |
| Initial assessment     | Within 5 business days           |
| Patch development      | Within 30 days for critical/high |
| Coordinated disclosure | 90 days from initial report      |

If a fix is available before the 90-day deadline, we disclose upon release. If a fix is delayed, we negotiate an extended timeline with the reporter.

## Security Update Process

1. Reporter submits vulnerability through email.
2. We acknowledge receipt and assign a tracking identifier.
3. We assess severity using CVSS v3.1 scoring.
4. We develop and test a patch on a private branch.
5. We request a CVE (if applicable) and draft a GitHub Security Advisory.
6. We release a patch version and publish the advisory with it, which notifies downstream users.

## Security Scanning

- **Automated updates**: Dependabot checks npm and GitHub Actions dependencies weekly and opens pull requests for minor and patch updates.
- **Dependency auditing**: CI runs `npm audit --audit-level=critical` on every push and pull request. Run `npm audit` locally before opening a pull request that adds or bumps dependencies.

## Contact

For non-vulnerability security questions, reach us at security@ezclassify.com.
