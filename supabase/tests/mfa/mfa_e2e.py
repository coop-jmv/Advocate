# MFA enforcement test against the LOCAL Supabase stack only.
# Reads `supabase status -o json` on stdin.
import base64, hashlib, hmac, json, re, secrets, struct, subprocess, sys, time, urllib.error, urllib.request

st = json.loads(re.search(r"\{.*\}", sys.stdin.read(), re.S).group(0))
API = st["API_URL"]
assert API.startswith(("http://127.0.0.1", "http://localhost")), "REFUSING: not local"
ANON = st.get("ANON_KEY") or st.get("PUBLISHABLE_KEY")
SVC = st.get("SERVICE_ROLE_KEY") or st.get("SECRET_KEY")
DB = subprocess.run(["docker", "ps", "--filter", "name=supabase_db", "--format", "{{.Names}}"],
                    capture_output=True, text=True).stdout.split()[0]

results = []
def check(name, cond, detail=""):
    results.append(cond)
    print(("PASS " if cond else "FAIL ") + name + (f"  [{detail}]" if detail else ""))

def req(method, path, token=None, body=None, key=ANON):
    h = {"apikey": key, "Content-Type": "application/json"}
    if token: h["Authorization"] = "Bearer " + token
    r = urllib.request.Request(API + path, data=json.dumps(body).encode() if body is not None else None,
                               headers=h, method=method)
    try:
        with urllib.request.urlopen(r, timeout=30) as resp:
            raw = resp.read(); return resp.status, (json.loads(raw) if raw else None)
    except urllib.error.HTTPError as e:
        raw = e.read()
        try: return e.code, json.loads(raw)
        except Exception: return e.code, raw.decode()[:200]

def psql(sql):
    return subprocess.run(["docker", "exec", "-i", DB, "psql", "-U", "postgres", "-tAc", sql],
                          capture_output=True, text=True).stdout.strip()

def totp(secret, offset=0):
    key = base64.b32decode(secret.upper() + "=" * (-len(secret) % 8))
    counter = int(time.time() // 30) + offset
    h = hmac.new(key, struct.pack(">Q", counter), hashlib.sha1).digest()
    o = h[-1] & 0x0F
    return "%06d" % ((struct.unpack(">I", h[o:o + 4])[0] & 0x7FFFFFFF) % 1000000)

def jwt_aal(tok):
    p = tok.split(".")[1]; return json.loads(base64.urlsafe_b64decode(p + "=" * (-len(p) % 4))).get("aal")

def new_user(label):
    email = f"mfa-{label}-{secrets.token_hex(3)}@example.com"; pw = "Pw-" + secrets.token_hex(8)
    s, b = req("POST", "/auth/v1/admin/users", SVC, {"email": email, "password": pw, "email_confirm": True,
               "user_metadata": {"full_name": f"MFA {label}", "firm_name": f"MFA {label} Chambers"}}, key=SVC)
    assert s == 200, (s, b); return b["id"], email, pw

def login(email, pw):
    s, b = req("POST", "/auth/v1/token?grant_type=password", body={"email": email, "password": pw})
    assert s == 200, (s, b); return b["access_token"]

def enroll_and_verify(token):
    s, f = req("POST", "/auth/v1/factors", token, {"factor_type": "totp", "friendly_name": "Authenticator app"})
    assert s == 200, (s, f)
    s, c = req("POST", f"/auth/v1/factors/{f['id']}/challenge", token, {})
    assert s == 200, (s, c)
    s, v = req("POST", f"/auth/v1/factors/{f['id']}/verify", token, {"challenge_id": c["id"], "code": totp(f["totp"]["secret"])})
    assert s == 200, (s, v)
    return f["id"], f["totp"]["secret"], v["access_token"]

def step_up(token, factor_id, secret):
    s, c = req("POST", f"/auth/v1/factors/{factor_id}/challenge", token, {})
    s, v = req("POST", f"/auth/v1/factors/{factor_id}/verify", token, {"challenge_id": c["id"], "code": totp(secret)})
    return s, v

created = []
try:
    # ---- user with no 2FA: nothing changes for them
    uid, email, pw = new_user("plain"); created.append(uid)
    t = login(email, pw)
    s, _ = req("GET", "/rest/v1/matters?select=id", t)
    check("no 2FA: aal1 session can read data", s == 200, f"HTTP {s}")
    s, _ = req("POST", "/rest/v1/matters", t, {"title": "Test matter", "created_by": uid})
    check("no 2FA: aal1 session can write data", s in (200, 201), f"HTTP {s}")

    # ---- user turns 2FA on
    uid2, email2, pw2 = new_user("mfa"); created.append(uid2)
    t = login(email2, pw2)
    fid, secret, aal2 = enroll_and_verify(t)
    check("enrolment verify returns an aal2 session", jwt_aal(aal2) == "aal2", jwt_aal(aal2))

    # a fresh password-only login = the stolen-password case
    stolen = login(email2, pw2)
    check("password-only login after 2FA is aal1", jwt_aal(stolen) == "aal1")
    s, b = req("GET", "/rest/v1/matters?select=id", stolen)
    check("aal1: table read BLOCKED", s == 403 and "Two-factor" in json.dumps(b), f"HTTP {s} {str(b)[:90]}")
    s, b = req("POST", "/rest/v1/rpc/export_chamber_data", stolen, {})
    check("aal1: export_chamber_data RPC BLOCKED", s == 403, f"HTTP {s}")
    s, b = req("POST", "/rest/v1/rpc/delete_my_account", stolen, {})
    check("aal1: delete_my_account RPC BLOCKED", s == 403, f"HTTP {s}")
    check("  ...and the account still exists", psql(f"select count(*) from auth.users where id='{uid2}'") == "1")
    s, b = req("POST", "/rest/v1/matters", stolen, {"title": "Sneaky", "created_by": uid2})
    check("aal1: table write BLOCKED", s == 403, f"HTTP {s}")
    check("  ...and nothing was written", psql(f"select count(*) from public.matters where title='Sneaky'") == "0")

    # RLS backstop, bypassing the hook: run as authenticated with aal1 claims directly
    rls = psql(f"""begin; set local role authenticated;
      select set_config('request.jwt.claims', '{{"sub":"{uid2}","role":"authenticated","aal":"aal1"}}', true);
      select 'rows=' || count(*) from public.profiles; rollback;""").splitlines()
    rows = next((l for l in rls if l.startswith("rows=")), "rows=?")
    check("RLS backstop: aal1 sees 0 rows even without the hook", rows == "rows=0", rows)

    # entering the code unlocks it
    s, v = step_up(stolen, fid, secret)
    check("entering the code upgrades to aal2", s == 200 and jwt_aal(v["access_token"]) == "aal2", f"HTTP {s}")
    s, _ = req("GET", "/rest/v1/matters?select=id", v["access_token"])
    check("aal2: table read allowed", s == 200, f"HTTP {s}")
    s, b = req("POST", "/rest/v1/rpc/my_entitlements", v["access_token"], {})
    check("aal2: RPC allowed", s == 200, f"HTTP {s}")
    s, _ = step_up(stolen, fid, "JBSWY3DPEHPK3PXP")  # wrong secret -> wrong code
    check("a wrong code is rejected", s in (400, 422), f"HTTP {s}")

    # ---- platform admin
    uid3, email3, pw3 = new_user("admin"); created.append(uid3)
    psql(f"insert into public.platform_admins (user_id) values ('{uid3}')")
    t = login(email3, pw3)
    s, st_ = req("POST", "/rest/v1/rpc/my_admin_status", t, {})
    check("admin without 2FA: my_admin_status says admin, not enrolled",
          s == 200 and st_[0]["is_admin"] and not st_[0]["mfa_enrolled"], str(st_))
    s, lic = req("GET", "/rest/v1/licenses?select=tenant_id", t)
    check("admin without 2FA: NO admin powers (sees only own licence)", s == 200 and len(lic) == 1, f"{len(lic)} rows")
    s, _ = req("GET", "/rest/v1/platform_admins?select=user_id", t)
    total = int(psql("select count(*) from public.licenses"))
    fid3, secret3, aal2_admin = enroll_and_verify(t)
    s, lic = req("GET", "/rest/v1/licenses?select=tenant_id", aal2_admin)
    check("admin with 2FA verified: admin powers back (sees all licences)", s == 200 and len(lic) == total, f"{len(lic)}/{total}")
    stolen_admin = login(email3, pw3)
    s, _ = req("GET", "/rest/v1/licenses?select=tenant_id", stolen_admin)
    check("admin, password only after 2FA: BLOCKED", s == 403, f"HTTP {s}")

    # ---- signup path unaffected
    check("signup still builds a chamber", psql(f"select count(*) from public.profiles where id='{uid}' and tenant_id is not null") == "1")
finally:
    for u in created:
        psql(f"delete from public.platform_admins where user_id='{u}'")
        req("DELETE", f"/auth/v1/admin/users/{u}", SVC, key=SVC)
    psql("delete from public.licenses where tenant_id in (select id from public.tenants where name like 'MFA % Chambers'); delete from public.tenants where name like 'MFA % Chambers'")
    print(f"cleanup: {len(created)} users removed; leftover tenants: " + psql("select count(*) from public.tenants where name like 'MFA % Chambers'"))
print(f"\n{sum(results)}/{len(results)} checks passed")
