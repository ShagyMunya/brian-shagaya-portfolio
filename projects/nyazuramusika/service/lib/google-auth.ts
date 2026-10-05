import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";

export type GoogleSettings = {
  DB: D1Database; GOOGLE_CLIENT_ID?: string; GOOGLE_CLIENT_SECRET?: string;
  MARKET_ORIGIN?: string; ADMIN_GOOGLE_EMAILS?: string;
};
export type GoogleIdentity = { sub: string; email: string; name: string; authoritativeEmail: boolean };
export class GoogleAuthError extends Error { constructor(public status: number, message: string) { super(message); } }
const encoder = new TextEncoder();
const jwks = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"), { timeoutDuration: 10_000 });
const cookieName = "__Host-nyazura-google";
const token = () => btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
const digest = async (value: string) => btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.digest("SHA-256",encoder.encode(value))))).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");

function settings(env: GoogleSettings) {
  let origin = "";
  try { const url = new URL(env.MARKET_ORIGIN || ""); if(url.protocol === "https:" && !url.username && !url.password && url.pathname === "/") origin = url.origin; } catch {}
  if(!origin || !env.GOOGLE_CLIENT_ID?.endsWith(".apps.googleusercontent.com") || !env.GOOGLE_CLIENT_SECRET) {
    throw new GoogleAuthError(503,"Google sign-in is not connected yet. The app owner needs to finish Google setup.");
  }
  return { clientId: env.GOOGLE_CLIENT_ID, secret: env.GOOGLE_CLIENT_SECRET, redirect: origin + "/api/auth/google/callback" };
}
export function googleConfigured(env: GoogleSettings): boolean { try { settings(env); return true; } catch { return false; } }

// This verifier never trusts decoded claims before checking Google's signature.
// A key resolver parameter lets isolated tests use a locally signed test JWT.
export async function verifyGoogleIdentity(idToken: string, clientId: string, nonce: string, keys: JWTVerifyGetKey = jwks): Promise<GoogleIdentity> {
  try {
    if(idToken.length > 16_384) throw new Error("token too large");
    const { payload } = await jwtVerify(idToken, keys, {
      issuer: ["https://accounts.google.com", "accounts.google.com"], audience: clientId,
      algorithms: ["RS256"], requiredClaims: ["sub", "iat", "exp", "email", "email_verified", "nonce"],
      maxTokenAge: "10m", clockTolerance: 30,
    });
    if(payload.nonce !== nonce || payload.email_verified !== true || typeof payload.sub !== "string" || !payload.sub || payload.sub.length > 255 ||
      typeof payload.email !== "string" || payload.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email) ||
      (payload.azp !== undefined && payload.azp !== clientId)) throw new Error("invalid identity");
    const email = payload.email.toLowerCase();
    const name = (typeof payload.name === "string" ? payload.name : email.split("@")[0]).replace(/[\u0000-\u001f]/g, "").trim().slice(0,60);
    return { sub: payload.sub, email, name, authoritativeEmail: email.endsWith("@gmail.com") || (typeof payload.hd === "string" && !!payload.hd) };
  } catch { throw new GoogleAuthError(401,"Google could not verify this sign-in. Please start again from the app."); }
}

export async function beginGoogleLogin(request: Request, env: GoogleSettings): Promise<Response> {
  const config = settings(env), url = new URL(request.url);
  const challenge = url.searchParams.get("challenge") || "", appState = url.searchParams.get("state") || "";
  if(!/^[A-Za-z0-9_-]{43}$/.test(challenge) || !/^[A-Za-z0-9_-]{20,64}$/.test(appState)) throw new GoogleAuthError(400,"Start sign-in from the NyazuraMusika Android app.");
  const state = token(), browser = token(), nonce = token(), verifier = token(), now = Date.now();
  await env.DB.batch([
    env.DB.prepare("DELETE FROM google_auth_requests WHERE expires_at<?").bind(now),
    env.DB.prepare("INSERT INTO google_auth_requests (state_hash,browser_hash,nonce,google_verifier,challenge,app_state,expires_at) VALUES (?,?,?,?,?,?,?)")
      .bind(await digest(state),await digest(browser),nonce,verifier,challenge,appState,now+600_000),
  ]);
  const target = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  target.search = new URLSearchParams({client_id:config.clientId,redirect_uri:config.redirect,response_type:"code",scope:"openid email profile",state,nonce,
    code_challenge:await digest(verifier),code_challenge_method:"S256",prompt:"select_account"}).toString();
  return new Response(null,{status:302,headers:{Location:target.href,"Cache-Control":"no-store","Referrer-Policy":"no-referrer",
    "Set-Cookie":`${cookieName}=${browser}; Secure; HttpOnly; SameSite=Lax; Path=/; Max-Age=600`}});
}

export async function finishGoogleLogin(request: Request, env: GoogleSettings): Promise<{identity: GoogleIdentity; challenge: string; state: string}> {
  const config = settings(env), url = new URL(request.url);
  const state = url.searchParams.get("state") || "";
  const browser = request.headers.get("cookie")?.split(";").map(x=>x.trim()).find(x=>x.startsWith(cookieName+"="))?.slice(cookieName.length+1) || "";
  if(!/^[A-Za-z0-9_-]{43}$/.test(state) || !/^[A-Za-z0-9_-]{43}$/.test(browser)) throw new GoogleAuthError(401,"The sign-in request expired. Start again from the app.");
  const pending = await env.DB.prepare("DELETE FROM google_auth_requests WHERE state_hash=? AND browser_hash=? AND expires_at>? RETURNING nonce,google_verifier,challenge,app_state")
    .bind(await digest(state),await digest(browser),Date.now()).first<{nonce:string;google_verifier:string;challenge:string;app_state:string}>();
  if(!pending) throw new GoogleAuthError(401,"The sign-in request expired or was already used. Start again from the app.");
  if(url.searchParams.has("error")) throw new GoogleAuthError(403,"Google sign-in was cancelled. Return to the app to try again.");
  const code = url.searchParams.get("code") || "";
  if(!code || code.length > 4096) throw new GoogleAuthError(400,"Google did not return a valid sign-in code.");
  let response: Response;
  try {
    response = await fetch("https://oauth2.googleapis.com/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},
      body:new URLSearchParams({code,client_id:config.clientId,client_secret:config.secret,redirect_uri:config.redirect,grant_type:"authorization_code",code_verifier:pending.google_verifier}),
      signal:AbortSignal.timeout(15_000)});
  } catch { throw new GoogleAuthError(503,"Google could not be reached. Please try signing in again."); }
  if(!response.ok) throw new GoogleAuthError(401,"Google sign-in could not finish. Please start again from the app.");
  const data = await response.json() as {id_token?: unknown};
  if(typeof data.id_token !== "string") throw new GoogleAuthError(401,"Google did not return a verified account.");
  const identity = await verifyGoogleIdentity(data.id_token,config.clientId,pending.nonce);
  return {identity,challenge:pending.challenge,state:pending.app_state};
}

const escape = (value: string) => value.replace(/[&<>"']/g,x=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[x]!));
export function googleReturnPage(message: string, status = 200, appCode?: string, appState?: string): Response {
  const link = appCode && appState ? `nyazuramusika://auth?code=${encodeURIComponent(appCode)}&state=${encodeURIComponent(appState)}` : "";
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>NyazuraMusika sign-in</title><style>body{margin:0;background:#142738;color:#fff;font:18px system-ui;line-height:1.6}main{max-width:560px;margin:12vh auto;padding:28px}b{display:inline-block;background:#ffb34d;color:#142738;border-radius:14px;padding:4px 18px;font-size:32px}h1{font-size:32px;line-height:1.2}a{display:inline-block;background:#b64717;color:#fff;text-decoration:none;padding:14px 22px;border-radius:12px}small{display:block;margin-top:24px;color:#cbd7e2}</style></head><body><main><b>N</b><h1>${status===200?"You’re signed in.":"Sign-in could not finish."}</h1><p>${escape(message)}</p>${link?`<a href="${escape(link)}" rel="noreferrer">Return to NyazuraMusika</a><small>This link expires after two minutes.</small>`:"<small>Return to the app and start sign-in again.</small>"}</main></body></html>`;
  return new Response(html,{status,headers:{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store","Referrer-Policy":"no-referrer","X-Content-Type-Options":"nosniff",
    "Content-Security-Policy":"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",
    "Set-Cookie":`${cookieName}=; Secure; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`}});
}
