import LiveRoom from "./room";
export const dynamic = "force-dynamic";
export default async function Page({params}:{params:Promise<{id:string}>}) {
  const {id}=await params;
  if(!/^[a-f0-9-]{36}$/.test(id))return <main><h1>Open your live check from the app.</h1></main>;
  return <LiveRoom checkId={id}/>;
}
