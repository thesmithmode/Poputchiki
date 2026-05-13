---
title: "Traefik ACME HTTP-01 Challenge Requires Port 80 — iptables vs ufw"
aliases: [acme-port-80, letsencrypt-port80, http01-challenge, iptables-ufw-firewall, acme-json-empty]
tags: [traefik, deployment, tls, gotcha, infra, security]
sources:
  - "daily/2026-05-13.md"
created: 2026-05-13
updated: 2026-05-13
---

# Traefik ACME HTTP-01 Challenge Requires Port 80 — iptables vs ufw

Traefik's HTTP-01 ACME challenge (Let's Encrypt) requires that port 80 be publicly reachable. If `ufw` is inactive but `iptables` rules block port 80, the ACME challenge fails silently — Traefik starts, reports healthy, but never issues TLS certificates. The first diagnostic is checking `acme.json`: an empty file means no certificates have ever been issued.

## Key Points

- HTTP-01 ACME challenge: Let's Encrypt sends an HTTP request to `http://<domain>/.well-known/acme-challenge/<token>`; Traefik must receive it on port 80
- `ufw inactive` does NOT mean no firewall — `iptables` can have independent rules blocking port 80
- Diagnostic: check `acme.json` (typically `/opt/traefik/acme.json`); if empty `{}` → no certs issued → HTTPS broken
- Fix: `iptables -I INPUT -p tcp --dport 80 -j ACCEPT` + restart Traefik to trigger ACME retry
- Symptom: HTTPS connection hangs or gets SSL error; Traefik dashboard shows routes configured but certificates absent

## Details

Traefik's ACME resolver uses HTTP-01 validation by default. During certificate issuance, Let's Encrypt's servers make an outbound HTTP request (port 80) to the server's public IP for each domain being certified. If this request is blocked by a firewall rule, the ACME challenge times out and fails. Traefik does not loudly report this failure — it continues running and serving routes, but without valid TLS certificates.

The Linux firewall can be managed by multiple tools simultaneously. `ufw` is a frontend for `iptables`. When `ufw` is inactive (`ufw status` shows `Status: inactive`), it does not manage `iptables` — but other processes or manual `iptables` commands may have installed rules independently. Checking `ufw` without also checking `iptables -L -n -v` gives an incomplete picture.

On the Poputchiki production server on 2026-05-13, `ufw` was inactive but `iptables` had blocking rules on INPUT chain. Port 80 was not reachable from the public internet. `acme.json` was empty — Traefik had never successfully issued any certificate. As a result, all four subdomains (`poputchiki.*`, `api.*`, `app.*`, `webhook.*`) had no TLS certificates, causing HTTPS connection failures. The initial symptom was `/api/users/me` returning "Failed to fetch" — the API was functionally deployed but HTTPS was broken.

**Diagnostic sequence for HTTPS failures:**
1. Check `acme.json` — empty = no certs issued
2. Check if port 80 responds: `curl -v http://<domain>/.well-known/acme-challenge/test`
3. Check `iptables -L INPUT -n -v` (not just `ufw status`)
4. Fix firewall rules + restart Traefik
5. Re-check `acme.json` after 1-2 minutes — should contain certificate objects

**Making iptables rules persistent:**
`iptables -I INPUT -p tcp --dport 80 -j ACCEPT` is not persistent across reboots. To persist:
- Debian/Ubuntu: `iptables-save > /etc/iptables/rules.v4` (requires `iptables-persistent` package)
- Or install `netfilter-persistent` and run `netfilter-persistent save`

Failing to persist means the firewall rule is lost after server reboot, breaking ACME renewal. Certificate renewal requires periodic HTTP-01 challenges, so port 80 must remain accessible permanently.

## Related Concepts

- [[concepts/traefik-docker-api-compat]] — Another Traefik production failure from the same deployment day; API version incompatibility preceded the ACME issue in the failure cascade
- [[concepts/reactive-deploy-fix-loop]] — ACME/port 80 issue was discovered in session 20:28, after 15+ prior deployment failures; a pre-deploy network audit would have caught it earlier
- [[concepts/deployment-pipeline]] — TLS certificates are required for all production subdomains; Traefik is the TLS termination point

## Sources

- [[daily/2026-05-13.md]] — Session 20:28: `acme.json` empty after successful deploy; root cause: iptables blocking port 80 (ufw inactive but iptables rules present); fix: `iptables -I INPUT -p tcp --dport 80 -j ACCEPT` + Traefik restart; 4 certs issued for all subdomains within 2 minutes; note: iptables rule not persisted = breaks after reboot
