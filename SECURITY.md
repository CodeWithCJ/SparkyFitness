# Security Policy

## Supported Versions

SparkyFitness is self-hosted and released often. Security fixes land in `main` and ship in the next release. Older releases are not patched, so please run the latest release.

| Version        | Supported |
| -------------- | --------- |
| Latest release | Yes       |
| `main`         | Yes       |
| Older releases | No        |

## Reporting a Vulnerability

Please do not report security vulnerabilities in public issues, pull requests or on Discord.

Report them privately through GitHub: open the repository's **Security** tab and choose **Report a vulnerability**, or go to <https://github.com/CodeWithCJ/SparkyFitness/security/advisories/new>. Only the maintainers can see the report.

Please include:

- the SparkyFitness version or commit, and how it is deployed (Docker Compose, Helm, bare metal…);
- the affected part: server, web app, mobile app, Garmin service, Docker image or Helm chart;
- steps to reproduce it, or a proof of concept;
- the impact, for example which data another account could read or change.

## What to Expect

SparkyFitness is maintained by volunteers, so response times are best effort. We aim to acknowledge a report within 7 days and to keep you updated while we work on a fix. When the fix is released we publish a security advisory, and we are happy to credit you in it unless you would rather stay anonymous.

Please give us reasonable time to release a fix before you disclose the issue publicly.

## Scope

In scope: the code in this repository, and the Docker images and Helm chart built from it.

Out of scope:

- vulnerabilities in third-party dependencies that are already public. Report those to the upstream project, but do tell us if SparkyFitness uses the dependency in a way that makes it exploitable;
- problems that come only from how an instance is configured, such as weak secrets or a database exposed to the internet;
- testing against instances you do not own or run, including automated scanning.
