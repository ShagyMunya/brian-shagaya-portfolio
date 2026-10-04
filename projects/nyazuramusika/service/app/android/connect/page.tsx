import { env } from "cloudflare:workers";
import { requireChatGPTUser } from "@/app/chatgpt-auth";
import { issueAuthCode, validateConnect, type MarketEnv } from "@/lib/marketplace";
export const dynamic = "force-dynamic";
async function Connect({ challenge, state }: { challenge: string; state: string }) {
  const returnTo = `/android/connect?challenge=${encodeURIComponent(challenge)}&state=${encodeURIComponent(state)}`;
  const user = await requireChatGPTUser(returnTo);
  const code = await issueAuthCode(env as unknown as MarketEnv,user.userId,challenge,state);
  const link = `nyazuramusika://auth?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`;
  return <main><span className="mark">N</span><p className="eyebrow">NYAZURAMUSIKA</p><h1>You’re signed in.</h1><p>Return to the Android app to finish connecting your seller account.</p>
    <a className="button" href={link} rel="noreferrer">Return to NyazuraMusika</a><p className="note">This link expires after two minutes. If it expires, start sign-in again from the app.</p></main>;
}
export default async function Page({ searchParams }: { searchParams: Promise<Record<string,string|undefined>> }) {
  const params = await searchParams,challenge=params.challenge||"",state=params.state||"";
  if(!validateConnect(challenge,state))return <main><span className="mark">N</span><h1>Open NyazuraMusika.</h1><p>Start seller sign-in from the Android app.</p></main>;
  return <Connect challenge={challenge} state={state} />;
}
