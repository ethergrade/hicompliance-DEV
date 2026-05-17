#!/usr/bin/env python3
"""
HiCompliance API ACL Test Suite
Tests multi-tenant isolation, role-based access, and authentication.
"""
import json, os, sys, urllib.request, urllib.error

API_BASE = os.environ.get("API_BASE", "https://hiapi.websoupcloud.it")
SUPER_ASSESSMENT = "019e2300-10dc-7383-843e-78c11845bfd1"
OTHER_TENANT = "5c7a4091-1fa3-4e26-88a9-b554d5a3bb2e"

PASS, FAIL, SKIP = 0, 0, 0

GREEN = "\033[0;32m"
RED   = "\033[0;31m"
YELLOW = "\033[0;33m"
NC    = "\033[0m"

# ─── HTTP helper ────────────────────────────────────────────────────────────

def api_call(method="GET", token=None, path="", body=None):
    url = f"{API_BASE}{path}"
    headers = {"Accept": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    data = json.dumps(body).encode() if body else None
    if data:
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        try:
            return json.loads(e.read().decode())
        except:
            return {"message": f"HTTP {e.code}"}
    except Exception as e:
        return {"message": str(e)}


def login(email, password):
    resp = api_call("POST", path="/auth/login", body={"email": email, "password": password})
    data = resp.get("data", resp) if isinstance(resp, dict) else {}
    return data.get("token", ""), data.get("tenant_id", ""), data


# ─── Assertions ─────────────────────────────────────────────────────────────

def _msg(resp):
    """Extract message or summary from response."""
    if not isinstance(resp, dict):
        return f"raw:{str(resp)[:60]}"
    data = resp.get("data", resp)
    if isinstance(data, dict):
        msg = data.get("message", "")
        if msg:
            return f"msg:{msg}"
        # Summary: first few keys
        keys = list(data.keys())[:3]
        vals = {k: str(data[k])[:40] for k in keys}
        return f"data:{vals}"
    if isinstance(data, list):
        return f"data:list_len={len(data)}"
    return f"data:{str(data)[:60]}"


def _is_blocked(msg):
    s = str(msg)
    return "Non autorizzato" in s or "Non autenticato" in s or "Endpoint non trovato" in s or "msg:" in s


def _is_ok(msg):
    s = str(msg)
    return s.startswith("data:") and "msg:" not in s


def check(name, condition, expected, actual):
    global PASS, FAIL
    if condition:
        PASS += 1
        print(f"  {GREEN}PASS{NC} {name}")
    else:
        FAIL += 1
        print(f"  {RED}FAIL{NC} {name}")
        print(f"    expected: {expected}")
        print(f"    actual:   {actual}")


# ─── Main ───────────────────────────────────────────────────────────────────

def main():
    global PASS, FAIL

    print(f"\n{'='*50}")
    print(f"  HiCompliance ACL Test Suite")
    print(f"  Target: {API_BASE}")
    print(f"{'='*50}\n")

    # Login
    print("[LOGIN] Authenticating...")
    super_token, _, _ = login("superadmin@hiconsole.it", "password")
    cust_token, cust_tenant_id, cust_data = login("customer@customer.it", "password")

    if not super_token:
        print(f"  {RED}FATAL:{NC} Cannot login as superadmin")
        sys.exit(1)
    if not cust_token:
        print(f"  {RED}FATAL:{NC} Cannot login as customer")
        sys.exit(1)

    print(f"  {GREEN}OK{NC} superadmin token: {super_token[:20]}...")
    print(f"  {GREEN}OK{NC} customer token: {cust_token[:20]}...")
    # tenant_id may not be in login response — fetch from /auth/me
    if not cust_tenant_id:
        me = api_call("GET", token=cust_token, path="/auth/me")
        cust_tenant_id = me.get("data", me).get("tenant_id", "")
    print(f"  {GREEN}OK{NC} customer tenant_id: {cust_tenant_id}")
    print()

    # =========================================================================
    # 1. AUTHENTICATION
    # =========================================================================
    print("─── 1. AUTHENTICATION ──────────────────────────────────────────────")

    r = api_call("GET", path="/tenants")
    check("1.1 No token → /tenants blocked", _is_blocked(_msg(r)),
          "blocked", _msg(r))

    r = api_call("GET", path="/assessments")
    check("1.2 No token → /assessments blocked", _is_blocked(_msg(r)),
          "blocked", _msg(r))

    r = api_call("GET", path="/tenant")
    check("1.3 No token → /tenant blocked", _is_blocked(_msg(r)),
          "blocked", _msg(r))

    r = api_call("GET", token="deadbeef-invalid", path="/tenants")
    check("1.4 Invalid token → blocked", _is_blocked(_msg(r)),
          "blocked", _msg(r))

    r = api_call("GET", token="99|" + super_token[3:], path="/tenants")
    check("1.5 Tampered token → blocked", _is_blocked(_msg(r)),
          "blocked", _msg(r))

    print()
    # =========================================================================
    # 2. SUPERADMIN ACCESS
    # =========================================================================
    print("─── 2. SUPERADMIN ACCESS ───────────────────────────────────────────")

    r = api_call("GET", token=super_token, path="/tenants")
    ok = _is_ok(_msg(r)) and "list_len=4" in _msg(r)
    check("2.1 Superadmin → GET /tenants (4 tenants)", ok,
          "list of 4 tenants", _msg(r))

    r = api_call("GET", token=super_token, path=f"/tenants/{cust_tenant_id}")
    ok = "Azienda Demo" in _msg(r)
    check("2.2 Superadmin → GET /tenants/{customer_id}", ok,
          "customer data", _msg(r))

    r = api_call("GET", token=super_token, path="/assessments")
    ok = _is_ok(_msg(r)) and "list_len=1" in _msg(r)
    check("2.3 Superadmin → GET /assessments", ok,
          "list of assessments", _msg(r))

    r = api_call("GET", token=super_token, path=f"/assessments/{SUPER_ASSESSMENT}/report")
    ok = "Assessment Srl" in str(r) and "summary" in str(r)
    check("2.4 Superadmin → GET /assessments/{id}/report", ok,
          "assessment data with summary", _msg(r)[:80])

    r = api_call("GET", token=super_token, path=f"/assessments/{SUPER_ASSESSMENT}/report-monthly")
    check("2.5 Superadmin → GET /assessments/{id}/report-monthly", _is_ok(_msg(r)),
          "monthly report", _msg(r))

    print()
    # =========================================================================
    # 3. CUSTOMER ISOLATION
    # =========================================================================
    print("─── 3. CUSTOMER ISOLATION ──────────────────────────────────────────")

    r = api_call("GET", token=cust_token, path="/tenants")
    check("3.1 Customer → GET /tenants BLOCKED", _is_blocked(_msg(r)),
          "blocked", _msg(r))

    r = api_call("GET", token=cust_token, path="/tenant")
    ok = "Azienda Demo" in _msg(r)
    check("3.2 Customer → GET /tenant (own tenant)", ok,
          "own tenant data", _msg(r))

    if cust_tenant_id:
        r = api_call("GET", token=cust_token, path=f"/tenants/{cust_tenant_id}")
        ok = "Azienda Demo" in _msg(r)
        check("3.3 Customer → GET /tenants/{own_id}", ok,
              "own tenant data", _msg(r))

    r = api_call("GET", token=cust_token, path=f"/tenants/{OTHER_TENANT}")
    check("3.4 Customer → GET /tenants/{other_id} BLOCKED", _is_blocked(_msg(r)),
          "blocked", _msg(r))

    r = api_call("GET", token=cust_token, path=f"/assessments/{SUPER_ASSESSMENT}/report")
    check("3.5 Customer → GET /assessments/{other}/report BLOCKED", _is_blocked(_msg(r)),
          "blocked", _msg(r))

    r = api_call("GET", token=cust_token, path="/tenant-services")
    check("3.6 Customer → GET /tenant-services (scoped)", _is_ok(_msg(r)),
          "scoped to own tenant", _msg(r))

    r = api_call("GET", token=cust_token, path="/assessments")
    check("3.7 Customer → GET /assessments (scoped)", _is_ok(_msg(r)),
          "scoped to own tenant", _msg(r))

    print()
    # =========================================================================
    # 4. CROSS-TENANT ATTACKS
    # =========================================================================
    print("─── 4. CROSS-TENANT ATTACK VECTORS ─────────────────────────────────")

    r = api_call("GET", token=cust_token, path=f"/tenant-services/{OTHER_TENANT}")
    check("4.1 GET /tenant-services/{other_id}", _is_blocked(_msg(r)),
          "blocked", _msg(r))

    r = api_call("PUT", token=cust_token, path=f"/tenants/{OTHER_TENANT}", body={"name":"HACKED"})
    check("4.2 PUT /tenants/{other_id} BLOCKED", _is_blocked(_msg(r)),
          "blocked", _msg(r))

    r = api_call("DELETE", token=cust_token, path=f"/tenants/{OTHER_TENANT}")
    check("4.3 DELETE /tenants/{other_id} BLOCKED", _is_blocked(_msg(r)),
          "blocked", _msg(r))

    r = api_call("POST", token=cust_token, path="/assessments",
                 body={"name":"Fake", "tenant_id": OTHER_TENANT})
    check("4.4 POST /assessments for other tenant BLOCKED", _is_blocked(_msg(r)),
          "blocked", _msg(r))

    # =========================================================================
    # 5. ROLE-BASED ACCESS MATRIX
    # =========================================================================
    print()
    print("─── 5. ROLE-BASED ACCESS MATRIX ────────────────────────────────────")

    # Login as different role users
    role_users = [
        ("admin@demo.it", "admin", "27cce7e2-ccc0-40e7-960e-14e4e7c499ee"),
        ("viewer@demo.it", "viewer", "27cce7e2-ccc0-40e7-960e-14e4e7c499ee"),
        ("admin2@acme.it", "admin", "37fd751e-639b-4f68-8762-7d3e8b5ea8c8"),
    ]
    role_tokens = {}
    for email, role_desc, tid in role_users:
        tok, _, _ = login(email, "password")
        if tok:
            role_tokens[email] = tok

    matrix_endpoints = ["/tenants", "/tenant", "/users", "/assessments", "/tenant-services"]

    for ep in matrix_endpoints:
        for email, role_desc, _ in role_users:
            if email not in role_tokens:
                continue
            r = api_call("GET", token=role_tokens[email], path=ep)
            msg = _msg(r)
            blocked = _is_blocked(msg)
            ok = _is_ok(msg)

            if ep == "/tenants":
                # Non-superadmin should NOT list all tenants
                check(f"5.x {email} → {ep} blocked", blocked, "blocked", msg)
            elif ep == "/tenant":
                # Non-superadmin should see own tenant
                check(f"5.x {email} → {ep} own tenant", ok, "own tenant", msg)
            elif ep == "/users":
                # Should be scoped
                check(f"5.x {email} → {ep} scoped", ok, "scoped", msg)
            elif ep == "/assessments":
                check(f"5.x {email} → {ep} scoped", ok, "scoped", msg)
            elif ep == "/tenant-services":
                check(f"5.x {email} → {ep} scoped", ok, "scoped", msg)

    print()
    # =========================================================================
    # 6. ENDPOINT INVENTORY (informational — not scored)
    # =========================================================================
    print("─── 6. ENDPOINT INVENTORY (informational) ──────────────────────────")

    r = api_call("GET", token=super_token, path=f"/integrations/organization/{cust_tenant_id}")
    exists = "Endpoint non trovato" not in _msg(r)
    tag = f"{GREEN}EXISTS{NC}" if exists else f"{YELLOW}MISSING{NC}"
    print(f"  {tag} 6.1 GET /integrations/organization/{{id}} → {_msg(r)}")

    r = api_call("GET", token=super_token, path=f"/organizations/{cust_tenant_id}/integrations")
    exists = "Endpoint non trovato" not in _msg(r)
    tag = f"{GREEN}EXISTS{NC}" if exists else f"{YELLOW}MISSING{NC}"
    print(f"  {tag} 6.2 GET /organizations/{{id}}/integrations → {_msg(r)}")

    r = api_call("GET", token=super_token, path="/api/integrations")
    exists = "Endpoint non trovato" not in _msg(r)
    tag = f"{GREEN}EXISTS{NC}" if exists else f"{YELLOW}MISSING{NC}"
    print(f"  {tag} 6.3 GET /api/integrations → {_msg(r)}")

    r = api_call("GET", token=super_token, path="/patches")
    exists = "Endpoint non trovato" not in _msg(r)
    tag = f"{GREEN}EXISTS{NC}" if exists else f"{YELLOW}MISSING{NC}"
    print(f"  {tag} 6.4 GET /patches → {_msg(r)}")

    r = api_call("GET", token=super_token, path="/firewall/rules")
    exists = "Endpoint non trovato" not in _msg(r)
    tag = f"{GREEN}EXISTS{NC}" if exists else f"{YELLOW}MISSING{NC}"
    print(f"  {tag} 6.5 GET /firewall/rules → {_msg(r)}")

    r = api_call("GET", token=super_token, path="/endpoints")
    exists = "Endpoint non trovato" not in _msg(r)
    tag = f"{GREEN}EXISTS{NC}" if exists else f"{YELLOW}MISSING{NC}"
    print(f"  {tag} 6.6 GET /endpoints → {_msg(r)}")

    print()
    # =========================================================================
    # REPORT
    # =========================================================================
    total = PASS + FAIL + SKIP
    print(f"{'='*50}")
    print(f"  Results: {GREEN}{PASS} passed{NC}, {RED}{FAIL} failed{NC}, {YELLOW}{SKIP} skipped{NC} (total: {total})")
    print(f"{'='*50}")
    print()

    if FAIL > 0:
        print(f"  {RED}⚠ SOME TESTS FAILED{NC}\n")
        sys.exit(1)
    else:
        print(f"  {GREEN}✓ ALL TESTS PASSED{NC}\n")
        sys.exit(0)


if __name__ == "__main__":
    main()
