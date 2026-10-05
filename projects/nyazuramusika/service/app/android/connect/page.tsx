import { validateConnect } from "@/lib/marketplace";
export const dynamic = "force-dynamic";
export default async function Page({ searchParams }: { searchParams: Promise<Record<string,string|undefined>> }) {
  const params=await searchParams,challenge=params.challenge||"",state=params.state||"";
  if(!validateConnect(challenge,state))return <main><span className="mark">N</span><h1>Open NyazuraMusika.</h1><p>Start Google sign-in from the Android app.</p></main>;
  return <main><span className="mark">N</span><h1>Sign in to NyazuraMusika.</h1><p>Connect your Google account to browse goods, register as a seller or manage the market.</p>
    <a className="button" href={`/api/auth/google/start?challenge=${encodeURIComponent(challenge)}&state=${encodeURIComponent(state)}`}>Sign in with Google</a></main>;
}
