# Security and accessibility review

Review date: 2026-08-05
Ticket: CHG-060

## Security boundary

ChargeWise treats the browser, request input, cookies, provider responses, and
cache records as untrusted. Authentication proves who the caller is;
authorization is enforced separately by including the authenticated user ID in
queries for user-owned resources.

The API already uses:

- Argon2id password hashing;
- opaque, cryptographically random server-side sessions;
- HttpOnly, SameSite cookies and Secure cookies in production;
- exact-origin CORS and origin checks for state-changing requests;
- Redis-backed authentication rate limiting;
- request-size limits, Helmet headers, and hidden framework identity;
- runtime schemas at HTTP, provider, cache, and serialization boundaries;
- generic production errors with request IDs instead of private details.

## CHG-060 hardening

This review adds:

- explicit trusted-proxy hop configuration for correct client-IP rate limiting;
- production-only HTTPS web-origin and TLS Redis requirements;
- deterministic checks that reject tracked local environment files, private
  keys, and server-secret references in browser code;
- production dependency auditing in continuous integration;
- a skip link and a stable main-content target;
- consistent focus-visible styles for interactive controls;
- reduced-motion behavior;
- field-level `aria-invalid` state and focus movement to the first invalid
  control in the primary authentication, vehicle, route, and charging-session
  forms.

## Verification

Run:

```text
pnpm security:secrets
pnpm security:audit
pnpm check
```

The review that initiated CHG-060 found no production dependency advisory and
no tracked real environment file or private key. CI repeats the deterministic
secret-boundary check and the registry-backed production audit on every pull
request and push to `main`.

## Residual risks and release follow-up

- `TRUST_PROXY_HOPS` must match the selected production hosting topology. Too
  many trusted hops can allow spoofed forwarding headers; too few can collapse
  users behind one proxy IP.
- Production PostgreSQL transport settings depend on the selected managed
  provider and must be verified during CHG-063.
- Automated component tests do not replace keyboard, zoom, contrast, screen
  reader, and mobile-browser checks. Those manual checks remain release
  evidence.
- Dependency audit results are time-sensitive and must be rerun during release.
- The tracked-secret check protects repository boundaries but is not a complete
  historical secret scanner. Git history and deployment-secret configuration
  must also be reviewed before publishing the repository.
