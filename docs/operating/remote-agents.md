---
title: Remote agents (consumer-hosted)
description: Operating runbook for running Spawnly agents on your own compute — register them against an org's active STS attestation anchor and run the sidecar in remote mode. The consumer's AWS credentials never touch Spawnly.
---

# Remote agents (consumer-hosted)

> **Status: runbook stub.** The end-to-end SDK walkthrough (Go) lives in the
> Go SDK README (`sdks/go/README.md`); this page is the operating overview and
> the deployment prerequisites. Real-AWS federation is verified separately from
> the in-cluster fake-STS e2e.

A **remote agent** runs on *your* compute — not Spawnly's cluster — and
authenticates with your [organization](../concepts/organizations.md)'s anchored
AWS STS identity. There is **no operator on your side**: you run the
`agent-sidecar` next to your agent process yourself. Once running, the agent
appears in the registry and dashboard with full lifecycle parity — list, events,
and **revoke all work identically** to a platform-hosted agent, because
authorization is enforced in SpiceDB, which is runtime-agnostic.

## Prerequisites

1. **An active org attestation anchor.** An org admin registers an STS anchor
   (`awsAccountId` + `roleArnPattern`) and activates it by presenting a signed
   `GetCallerIdentity` from that account (proof of control). Until the anchor is
   **active**, remote registration is refused (`409`). See
   [Organizations → Per-org attestation anchors](../concepts/organizations.md#per-org-attestation-anchors).
2. **Public reachability** of two Spawnly endpoints from your compute:
   - the **registry** (self-registration + events), and
   - the **Keycloak token endpoint** (minting).

   On the hosted deployment these ride the `spawnly.run` edge; on a private
   deployment expose them via your ingress. The dashboard-only origin is not
   sufficient — the sidecar talks to these two services directly.

## Flow

1. **Register** (org member, user token). An org member registers the agent
   against the org via the SDK or control-plane API; this preregisters a
   `remote-<shortID>` record (`Placement=remote`, `OrgID`, owned by the
   registering member). The registering member owns the agent, so
   ownership/consent/revoke semantics match a platform-hosted spawn.
2. **Run the sidecar in remote mode** on your compute, alongside your agent:

   | Env | Value |
   |-----|-------|
   | `AGENT_PLACEMENT` | `remote` |
   | `AGENT_ID` | the `remote-<shortID>` from step 1 |
   | `AGENT_TYPE` | the registered agent type (OAuth `client_id`) |
   | `ATTESTOR` | `aws-sts` |
   | `REGISTRY_URL` | the public registry base URL |
   | `IS_TOKEN_URL` | the public Keycloak token endpoint |
   | `AWS_ROLE_SESSION_NAME` | the `AGENT_ID` (the STS session name **is** the agentId) |

   The sidecar needs **ambient AWS credentials** for a role matching the anchor's
   `roleArnPattern`, assumed with `--role-session-name <agentID>`. Spawnly never
   sees these credentials: the sidecar presigns a `GetCallerIdentity` request and
   forwards only that presigned presentation. In remote mode the sidecar skips
   the SPIFFE socket entirely.

3. The sidecar **self-registers** (flipping the record to `active`) and serves
   tokens on `localhost:8089`. Your agent mints exactly as a platform-hosted one
   does.

## Isolation

A given STS identity can only ever authenticate an agent whose registry record
belongs to that identity's org anchor. Presenting org A's identity for an agent
recorded under org B — or under an unanchored org — is refused end-to-end. A
dashboard **revoke** severs the remote agent's next mint.

## See also

- [Organizations (multi-tenancy)](../concepts/organizations.md)
- Go SDK: `RegisterRemoteAgent` + the full walkthrough (`sdks/go/README.md`).
