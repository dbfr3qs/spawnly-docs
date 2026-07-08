---
title: Organizations (multi-tenancy)
description: What a Spawnly organization is — the SaaS business-account boundary — how it differs from the per-agent tenant primitive, how membership drives authorization via SpiceDB, and how org-scoped templates and per-org attestation anchors work.
---

# Organizations

An **organization** (org) is Spawnly's SaaS business-account boundary: a group of
users who share agents, templates, and (optionally) their own attestation trust
anchor. It is the unit of adoption for the hosted product — two people at the same
company belong to one org, see each other's agents, and manage shared templates.

> **Organization vs. the `tenantId` primitive.** These are orthogonal. An
> **organization** is *Spawnly's* account boundary and drives authorization. A
> **`tenantId`** is an opaque partition key a consumer applies to *their own*
> downstream tenanting (the conditional spawn Tenant field, `requiresTenant`
> templates, and the SVID tenant path segment). An org member spawning an agent
> with `tenantId=their-customer-42` is partitioning *their* world, not Spawnly's.
> Orgs do not change any tenant-primitive behaviour.

## The identity chain

One identifier threads the layers an org touches:

**Keycloak organization alias = registry record `orgId` = SpiceDB
`organization:` object id.**

- **Keycloak Organizations** (GA in the pinned 26.4 image) represent orgs inside
  the single `spawnly` realm and are the source of truth for *who is in an org*.
- **SpiceDB** relations (`organization:<id>#member` / `#admin`) are the source of
  truth for *authorization decisions*.
- The **registry** stores the neutral org record (`orgId`, name, removal
  disposition, optional attestation anchor).

Membership is a **dual-write**: every change flows through the registry's org
onboarding API, which writes Keycloak and SpiceDB together with cleanup on
partial failure. Never edit org membership directly in the Keycloak admin
console — a console edit desyncs authorization from membership.

## Roles

| Role | Can |
| --- | --- |
| **Platform admin** (realm `admin`) | Create orgs and assign the first org admin; manage the global template catalog; retains the org-less ("Global") powers. |
| **Org admin** | Manage the org's membership (add/remove/promote); full control of every agent in the org; manage the org's UI-created templates; register and prove control of the org's attestation anchor. |
| **Org member** | Spawn agents into the org and manage **their own**; see the whole org's agents **read-only**; spawn from global + org-scoped templates; view (not edit) the org's anchor. |

Keycloak Organizations has no native per-org role, so the admin-vs-member
distinction lives entirely in SpiceDB.

## Login & org selection

Tokens are **single-org**: the dashboard requests the `organization:<alias>`
scope, so a token's `organization` claim names exactly one active org.

- A user in exactly one org is logged straight into it.
- A user in multiple orgs gets a **picker**; switching orgs **re-runs the OIDC
  flow** with the new org scope — silently, against the live Keycloak SSO
  session, so no password prompt (single-org sessions map 1:1 onto the future
  subdomain model).
- An ordinary user in no org gets a clear **"no organization" screen** (with a
  self-serve create-org form), not a broken dashboard.
- A realm admin may also pick "Global (no organization)" and keeps today's
  org-less spawn path.

`orgId` is **always derived from the token claim, never from a request body.**
Agent-path spawns inherit the parent record's org; agent-minted tokens carry the
org claim stamped from the agent's registry record (org-less agents carry none),
so an agent can never mint a token claiming an org other than the one recorded at
spawn.

## Authorization matrix

| Action | Own agent | Same-org agent (other user) | Cross-org |
| --- | --- | --- | --- |
| view (list / events / logs / chain) | member | member (read-only) | 404 |
| spawn / message / revoke / resume / dismiss / kill | member (owner) | **org admin only** | 404 |

Cross-org resources are invisible — denial is always **404**, never a
"forbidden" that would confirm the resource exists.

## Templates

- The **seeded platform catalog stays global**: visible and spawnable in every
  org, managed by platform admins only.
- **Templates created via the dashboard UI are scoped to the org they were
  created in** — visible, spawnable, and manageable only within that org
  (org admins manage them), regardless of the template's `requiresTenant` value.

## Per-org attestation anchors

By default an org's agents attest via the platform default (in-cluster SPIRE),
exactly as today. An org may instead register an **attestation anchor** — first
mode: STS trust federation with the consumer's AWS account
(`{type: sts, awsAccountId, roleArnPattern}`).

- **Proof of control:** an anchor registers as `pending`; it activates only after
  a signed STS `GetCallerIdentity` presentation from the account matches the
  anchor's account + role pattern (run from the consumer's AWS account — no
  cross-account IAM).
- **Isolation invariant (the point of it all):** a credential verifies **only**
  against the anchor of the org that owns the agent's registry record. Org A's
  AWS account can never attest an agent recorded under org B; an unanchored org's
  agents can never authenticate via someone else's anchor; anchors never fall
  back across orgs. Verification failure is oracle-free.

An anchor is the prerequisite for **consumer-hosted (remote) agents** — see the
[Remote agents runbook](../operating/remote-agents.md).

## Self-serve signup

Realm registration is enabled: a new user signs up, lands on the no-org screen,
creates an org, and becomes its admin. (Closed-beta guardrails: one org per
account, a reserved-slug list, DNS-label-constrained slugs.)
