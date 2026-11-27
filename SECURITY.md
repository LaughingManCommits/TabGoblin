# Security policy

## Reporting a vulnerability

Please report a suspected vulnerability privately, not in a public issue.

Use GitHub's private reporting for this repository: on the repository's **Security** tab,
choose **Report a vulnerability**. If that option is not offered, open an issue that asks for
a private contact and contains no details.

A useful report says:

- which version or commit, which operating system and which Chrome version;
- what an attacker can do that the [security model](docs/security-model.md) says they cannot;
- the steps to reproduce it, ideally against the demo sites in `demo-site/`.

This is a small project without a response-time commitment or a bounty. Reports are read, and
a confirmed vulnerability is fixed in a new release and described in its notes.

## Supported versions

Only the latest release is maintained. The server and the extension must be of the same
release.

## Scope

In scope is anything that breaks a control the security model labels as **enforced**, for
example:

- reaching a tab, an origin or a session that was not authorized for the agent;
- obtaining cookies, tokens, storage or password values through a tool;
- a web page that grants access, answers a prompt or changes a setting;
- a website or an unpaired local program that drives the browser through the server;
- a submission that is sent without the required approval, or sent twice.

Not vulnerabilities, because the security model states them as limits:

- a program running as the same operating-system user reading the pairing token or an agent's
  key, or editing the settings file;
- an agent being misled by page content within the access it was given;
- a secret that a page displays as ordinary text reaching the agent;
- gaps in the best-effort controls (redaction by shape, recognition of credential fields other
  than passwords, recognition of submitting and high-impact controls by English labels), though reports that improve them are welcome as ordinary issues.

The [residual risks](docs/security-model.md#residual-risks) list them in full.
