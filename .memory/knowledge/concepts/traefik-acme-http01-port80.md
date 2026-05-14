---
title: "Traefik ACME HTTP-01 Requires Port 80 Open"
aliases: [acme-http01, letsencrypt-port80, acme-json-empty, iptables-port80, ufw-inactive-iptables]
tags: [traefik, tls, deployment, gotcha, infra, security]
sources:
  - "daily/2026-05-13.md"
created: 2026-05-13
updated: 2026-05-13
---

# Traefik ACME HTTP-01 Requires Port 80 Open

Let's Encrypt HTTP-01 challenge requires port 80 to be accessible from the internet. If the firewall blocks port 80, Traefik cannot complete the ACME challenge, `acme.json` remains empty (no certificates), and all HTTPS connections fail. The diagnostic is straightforward: empty `acme.json` = certificates never issued.

## Key Points

- ACME HTTP-01: Let's Encrypt sends HTTP request to `http://domain/.well-known/acme-challenge/TOKEN` on port 80
- Port 80 blocked → challenge fails → no certificate issued → `acme.json` stays empty → HTTPS broken for all domains
- `ufw inactive` does NOT mean no firewall — direct iptables rules may still block port 80
- Diagnostic: `stat -c %s acme.json` — if file size is 2 bytes (`{}`), no certificates exist
- Fix: `iptables -I INPUT -p tcp --dport 80 -j ACCEPT` + restart Traefik → certificates issue within 1-2 minutes

## Details

Traefik's ACME resolver (Let's Encrypt integration) supports two challenge types: HTTP-01 and DNS-01. HTTP-01 is simpler (no DNS provider API needed) but requires that port 80 on the server is accessible from the public internet. Let's Encrypt's validation servers connect to `http://<domain>:80/.well-known/acme-challenge/<token>` to verify domain ownership.

On the Poputchiki production server (192.3.12.148), the firewall configuration had a deceptive state:
```bash
$ ufw status
Status: inactive

$ iptables -L -n | grep 80
# (no output — no rule for port 80)
# Default policy: DROP for INPUT chain
```

`ufw inactive` means the UFW frontend is not managing rules — but raw iptables rules persist independently. The default INPUT chain policy was DROP, which blocks all incoming traffic not explicitly allowed. Port 443 was allowed (for HTTPS), but port 80 was not — blocking the ACME challenge while allowing direct HTTPS connections.

The symptom chain:
1. Traefik starts with ACME HTTP-01 resolver configured
2. Traefik requests certificate for `poputchiki.searchingforgamesforever.online` + 3 subdomains
3. Let's Encrypt attempts HTTP-01 challenge on port 80 → connection refused (iptables DROP)
4. Challenge fails → Traefik logs warning (only visible at DEBUG level) → no certificate stored
5. `acme.json` remains empty (`{}`)
6. HTTPS requests arrive on port 443 → Traefik has no certificate → TLS handshake fails
7. Cloudflare proxy receives SSL error from origin → returns 502 to user

After opening port 80:
```bash
iptables -I INPUT -p tcp --dport 80 -j ACCEPT
docker compose restart traefik
```

Traefik restarted, re-attempted ACME, all 4 challenges passed, certificates appeared in `acme.json` within 2 minutes. HTTPS immediately began working for all domains.

**Persistence warning:** `iptables -I` adds a runtime rule that does not survive server reboot. To persist: install `iptables-persistent` / `netfilter-persistent` and run `netfilter-persistent save`, or add the rule to a startup script.

## Related Concepts

- [[concepts/traefik-docker-api-compat]] - Traefik must also have working Docker service discovery for ACME routes to be registered
- [[connections/post-deploy-invisible-failures]] - ACME failure is one of three invisible post-deploy failures: server reports healthy but HTTPS broken
- [[concepts/deployment-pipeline]] - Deploy smoke test must verify HTTPS, not just HTTP health endpoint

## Sources

- [[daily/2026-05-13.md]] - Session 20:28: `acme.json` empty after deploy; `ufw inactive` but iptables DROP on port 80 blocked ACME HTTP-01; fix: `iptables -I INPUT -p tcp --dport 80 -j ACCEPT` + Traefik restart → 4 certs issued in 2 minutes; persistence via `netfilter-persistent save` noted as follow-up
