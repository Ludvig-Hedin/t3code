---
title: "QR Pairing Security Antipattern: Master Token Exposure"
aliases: [qr-auth-antipattern, pairing-token-exposure, mobile-pairing-security]
tags: [security, authentication, mobile, pairing, antipattern]
sources:
  - "daily/2026-05-09.md"
created: 2026-05-09
updated: 2026-05-09
---

# QR Pairing Security Antipattern: Master Token Exposure

Embedding a master authentication token directly in a QR code for mobile device pairing creates a critical security vulnerability. Anyone who photographs the QR code — intentionally or inadvertently — gains full administrative access to the system. The correct pattern uses a short-lived pairing nonce that exchanges for a per-device, scope-limited token after successful handshake.

## Key Points

- **Master token in QR = full admin access** — A single photograph compromises the entire system, not just the pairing session
- **QR codes are inherently leaky** — Screenshots, screen shares, shoulder surfing, and reflections all expose QR content
- **Tokens should be scoped to device and session** — Each paired device gets its own revocable token with limited permissions
- **Short-lived nonce pattern** — QR contains a one-time pairing nonce (30-60 seconds TTL) that exchanges for a device token
- **Per-device tokens enable selective revocation** — Compromised devices can be revoked without affecting other paired devices

## Details

### The Vulnerable Pattern

A naive mobile pairing implementation might work like this:

1. Server generates QR code containing the master authentication token
2. Mobile app scans QR and stores the token
3. Mobile app uses token for all API requests

The problem: that token grants full access. If the QR is ever captured (screenshot during a demo, visible in a screen recording, photographed over someone's shoulder), the attacker has permanent admin access until the token is manually rotated — which invalidates ALL paired devices.

### The Secure Pattern

The correct approach uses a multi-step pairing handshake:

1. **Generate pairing nonce** — Server creates a short-lived (30-60s), single-use pairing nonce
2. **Display QR** — QR code contains only the nonce (not any auth token)
3. **Mobile scans** — App sends nonce to server with device identifier
4. **Token exchange** — Server validates nonce, generates per-device token scoped to mobile permissions
5. **Nonce expires** — Original pairing nonce is immediately invalidated

The resulting device token:

- Has limited scope (e.g., cannot modify system settings)
- Is tied to a specific device ID
- Can be individually revoked without affecting other devices
- Has its own expiration/refresh cycle

### Why This Matters

The antipattern was discovered during a security audit of a desktop-to-mobile pairing system. The audit finding rated it as the highest priority (C1) because:

1. **Attack surface is large** — QR codes are displayed on screens, which are frequently shared/recorded
2. **Impact is total** — Compromised master token = full system access
3. **Recovery is disruptive** — Rotating the master token disconnects all paired devices
4. **Detection is difficult** — No audit trail distinguishes legitimate vs. compromised token use

### Implementation Considerations

When implementing secure pairing:

- **Nonce TTL**: 30-60 seconds balances usability with security
- **Single use**: Nonce must be invalidated after first exchange, even if failed
- **Device registration**: Store device identifier to enable per-device revocation
- **Scope limitation**: Mobile tokens should have minimal necessary permissions
- **Audit logging**: Log pairing events with device fingerprints for forensics

## Related Concepts

- [[concepts/http-endpoint-authentication-patterns]] — Public vs. authenticated endpoints; this antipattern violates the principle of scoped authentication
- [[concepts/websocket-resilience-defense-layers]] — Defense in depth thinking applies to auth as well

## Sources

- [[daily/2026-05-09.md]] — "QR pairing antipattern: master auth token in QR payload = any photo = full admin access; use short-lived pairing nonce → per-device token exchange"
- [[daily/2026-05-09.md]] — "Redesign mobile pairing: short-lived nonce → per-device WS-scoped token (C1+C2)" — action item from security audit
