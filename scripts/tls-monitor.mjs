// External TLS/HTTPS monitor for lexdiary.online.
//
// Deliberately runs OFF Cloudflare (GitHub Actions, see
// .github/workflows/tls-monitor.yml). Cloudflare renews the certificate
// itself and can alert on its own failures, but an alert that lives in the
// same place as the thing it watches is no use when that place is the problem
// — a deleted zone, a broken origin rule or a revoked Universal SSL cert are
// exactly the cases where Cloudflare's own notification is the thing that
// never arrives. This checks from outside, as a browser would.
//
//   bun run tls:monitor
//
// Runs under Node, not Bun, and the package script pins that deliberately:
// Bun rejects the SECLEVEL=0 cipher string the TLS 1.0/1.1 probe needs and
// throws ERR_SSL_NO_CIPHER_MATCH, so under Bun that check degrades to an
// untested WARN. Every other check works identically in both.
//
// Exits non-zero if any check FAILs, which is what turns the workflow red.
// An untestable check reports WARN and does not fail the run — a probe this
// host's runtime cannot perform is not evidence of a healthy server.
import tls from "node:tls";

// Overridable so the failure paths can be exercised against a known-bad host
// (`node scripts/tls-monitor.mjs expired.badssl.com`) without editing the file,
// and so the workers.dev hostname can be checked the same way if it ever needs
// watching. The workflow passes nothing and gets production.
const HOST = process.argv[2] ?? "lexdiary.online";

// Cloudflare Universal SSL renews roughly 30 days before expiry. So a cert
// with less than three weeks left does not mean "renewal is due", it means
// "renewal has already failed at least once" — which is the signal worth
// waking up for. FAIL_DAYS leaves a working week to intervene by hand.
const WARN_DAYS = 21;
const FAIL_DAYS = 10;

const CONNECT_TIMEOUT_MS = 15000;

const results = [];
function record(level, check, detail) {
  results.push({ level, check, detail });
}

function inspectCertificate(host) {
  return new Promise((resolve, reject) => {
    // rejectUnauthorized is a check in its own right, not just hygiene: an
    // expired, self-signed or untrusted-chain certificate fails the handshake
    // here rather than being quietly reported as "present".
    const socket = tls.connect(
      { host, port: 443, servername: host, rejectUnauthorized: true },
      () => {
        // getPeerCertificate(true), not (false): under Bun the non-detailed
        // form returns an empty object, so every field below reads as
        // undefined and the monitor reports a perfectly healthy certificate as
        // expiring/uncovered. Node populates both forms identically. The only
        // difference in the detailed form is an extra issuerCertificate chain,
        // which nothing here reads. Re-check before "simplifying" this back.
        const certificate = socket.getPeerCertificate(true);
        const protocol = socket.getProtocol();
        socket.end();
        resolve({ certificate, protocol });
      },
    );
    socket.setTimeout(CONNECT_TIMEOUT_MS, () => {
      socket.destroy(new Error(`TLS handshake timed out after ${CONNECT_TIMEOUT_MS}ms`));
    });
    socket.on("error", reject);
  });
}

function daysUntil(dateString) {
  const expiry = new Date(dateString);
  if (Number.isNaN(expiry.getTime())) return undefined;
  return Math.floor((expiry.getTime() - Date.now()) / 86_400_000);
}

function coversHost(subjectaltname, host) {
  if (!subjectaltname) return false;
  const names = subjectaltname.split(",").map((entry) => entry.trim().replace(/^DNS:/, ""));
  return names.some((name) =>
    name.startsWith("*.")
      ? host.endsWith(name.slice(1)) && host.split(".").length === name.split(".").length
      : name.toLowerCase() === host.toLowerCase(),
  );
}

async function checkCertificate() {
  let certificate;
  let protocol;
  try {
    ({ certificate, protocol } = await inspectCertificate(HOST));
  } catch (error) {
    record("FAIL", "tls-handshake", `Could not complete a trusted TLS handshake: ${error.message}`);
    return;
  }

  record("PASS", "tls-handshake", `Trusted chain, negotiated ${protocol}`);

  const remaining = daysUntil(certificate.valid_to);
  if (remaining === undefined) {
    record("FAIL", "expiry", `Could not parse notAfter (${certificate.valid_to})`);
  } else {
    const detail = `${remaining} days left (expires ${certificate.valid_to})`;
    if (remaining < FAIL_DAYS) {
      record("FAIL", "expiry", `${detail} — renewal has not happened; intervene now`);
    } else if (remaining < WARN_DAYS) {
      record("WARN", "expiry", `${detail} — past the point Cloudflare should have renewed`);
    } else {
      record("PASS", "expiry", detail);
    }
  }

  // The issuer is reported rather than pinned. Cloudflare legitimately rotates
  // Universal SSL between CAs (Google Trust Services, Let's Encrypt, SSL.com),
  // so asserting a specific one would produce false alarms on a normal renewal.
  // A self-issued certificate is the case that is never legitimate here.
  const issuer = certificate.issuer ?? {};
  const issuerName = [issuer.O, issuer.CN].filter(Boolean).join(" / ") || "(unknown)";
  const selfSigned =
    certificate.subject?.CN && certificate.issuer?.CN === certificate.subject.CN && !issuer.O;
  if (selfSigned) {
    record("FAIL", "issuer", `Certificate appears self-issued (${issuerName})`);
  } else {
    record("PASS", "issuer", issuerName);
  }

  if (coversHost(certificate.subjectaltname, HOST)) {
    record("PASS", "san", certificate.subjectaltname);
  } else {
    record("FAIL", "san", `SANs do not cover ${HOST}: ${certificate.subjectaltname ?? "(none)"}`);
  }
}

// TLS 1.0/1.1 must be refused by the server. Cloudflare's Minimum TLS Version
// ships as 1.0, so this is off by default and one dashboard change away from
// silently regressing.
const LEGACY_VERSIONS = ["TLSv1", "TLSv1.1"];

// Error codes meaning "the client could not even make the offer", which is NOT
// the same as the server refusing it. Keeping these apart is the whole point:
// a probe that cannot speak TLS 1.0 looks exactly like a server that rejects
// TLS 1.0 unless you check, and reporting that as a PASS would mean this
// monitor confidently declares a vulnerable server safe. Modern OpenSSL builds
// make this the DEFAULT outcome — Node needs the SECLEVEL=0 cipher string
// below to offer legacy TLS at all, and Bun rejects that string outright and
// cannot run this probe. Hence "inconclusive" as a first-class result.
const CLIENT_CANNOT_OFFER = new Set(["ERR_SSL_NO_CIPHER_MATCH", "ERR_SSL_NO_PROTOCOLS_AVAILABLE"]);

// Codes/alerts that mean the server looked at the offer and turned it down.
const SERVER_REFUSED = new Set([
  "ERR_SSL_TLSV1_ALERT_PROTOCOL_VERSION",
  "ERR_SSL_UNSUPPORTED_PROTOCOL",
  "ERR_SSL_WRONG_VERSION_NUMBER",
  "ERR_SSL_SSLV3_ALERT_HANDSHAKE_FAILURE",
  "ERR_SSL_TLSV1_ALERT_INSUFFICIENT_SECURITY",
]);

function probeLegacyProtocol(host, version) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (!settled) {
        settled = true;
        resolve(value);
      }
    };

    let socket;
    try {
      socket = tls.connect({
        host,
        port: 443,
        servername: host,
        // The certificate is validated by checkCertificate(); here the only
        // question is which protocol version the server agrees to, and a
        // legacy handshake may legitimately pick a cipher this build distrusts.
        rejectUnauthorized: false,
        minVersion: version,
        maxVersion: version,
        // Without this, OpenSSL 3's default security level refuses to offer the
        // old CBC/SHA1 ciphers that TLS 1.0/1.1 require, and the probe fails
        // client-side before reaching the server.
        ciphers: "DEFAULT@SECLEVEL=0",
      });
    } catch (error) {
      // Bun throws synchronously from tls.connect() rather than emitting.
      finish({ outcome: "inconclusive", detail: error.message });
      return;
    }

    socket.on("secureConnect", () => {
      const negotiated = socket.getProtocol();
      socket.destroy();
      finish({ outcome: "negotiated", detail: negotiated });
    });
    socket.on("error", (error) => {
      socket.destroy();
      const code = error.code ?? "";
      const message = error.message ?? "";
      if (CLIENT_CANNOT_OFFER.has(code)) {
        finish({
          outcome: "inconclusive",
          detail: `${code}: this runtime cannot offer ${version}`,
        });
      } else if (
        SERVER_REFUSED.has(code) ||
        /alert (protocol version|handshake failure)/i.test(message)
      ) {
        finish({ outcome: "refused", detail: code || message.trim() });
      } else {
        finish({ outcome: "inconclusive", detail: `${code || "unknown"}: ${message.trim()}` });
      }
    });
    socket.setTimeout(CONNECT_TIMEOUT_MS, () => {
      socket.destroy();
      // A silent drop is ambiguous — plenty of servers reject a legacy hello by
      // hanging up — so it does not get to count as a pass.
      finish({ outcome: "inconclusive", detail: `no response within ${CONNECT_TIMEOUT_MS}ms` });
    });
  });
}

async function checkLegacyTlsRefused() {
  for (const version of LEGACY_VERSIONS) {
    const { outcome, detail } = await probeLegacyProtocol(HOST, version);
    const check = `legacy-${version.toLowerCase().replace(/[^a-z0-9]/g, "")}`;
    if (outcome === "negotiated") {
      record(
        "FAIL",
        check,
        `Server negotiated ${detail} — set Cloudflare SSL/TLS → Edge Certificates → ` +
          `Minimum TLS Version to 1.2`,
      );
    } else if (outcome === "refused") {
      record("PASS", check, `${version} refused by server (${detail})`);
    } else {
      record("WARN", check, `Could not test ${version} — ${detail}`);
    }
  }
}

async function checkHttpsRedirect() {
  let response;
  try {
    response = await fetch(`http://${HOST}/`, { redirect: "manual" });
  } catch (error) {
    record("FAIL", "https-redirect", `Request to http://${HOST}/ failed: ${error.message}`);
    return;
  }

  const location = response.headers.get("location") ?? "";
  if (response.status === 301 || response.status === 302 || response.status === 308) {
    if (location.startsWith("https://")) {
      record("PASS", "https-redirect", `${response.status} -> ${location}`);
    } else {
      record("FAIL", "https-redirect", `${response.status} but Location is not https: ${location}`);
    }
    return;
  }
  // A 200 here is the specific regression this check exists for: it means
  // cleartext HTTP is serving the app again, and because browsers ignore HSTS
  // on a cleartext response, the Strict-Transport-Security header stops
  // protecting first-time visitors the moment this breaks.
  record(
    "FAIL",
    "https-redirect",
    `http://${HOST}/ returned ${response.status} instead of redirecting — ` +
      `cleartext HTTP is being served and HSTS is inert for new visitors`,
  );
}

await checkCertificate();
await checkLegacyTlsRefused();
await checkHttpsRedirect();

const inCi = process.env["GITHUB_ACTIONS"] === "true";
for (const { level, check, detail } of results) {
  console.log(`${level.padEnd(4)} ${check.padEnd(15)} ${detail}`);
  if (inCi && level === "FAIL") console.log(`::error title=TLS ${check}::${detail}`);
  if (inCi && level === "WARN") console.log(`::warning title=TLS ${check}::${detail}`);
}

const failed = results.filter((r) => r.level === "FAIL");
const warned = results.filter((r) => r.level === "WARN");
console.log(
  `\n${HOST}: ${results.length - failed.length - warned.length} passed, ` +
    `${warned.length} warning(s), ${failed.length} failure(s)`,
);

if (failed.length > 0) process.exit(1);
