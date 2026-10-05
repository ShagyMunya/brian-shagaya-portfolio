"use client";
import { useEffect, useRef, useState } from "react";

type State={role:"buyer"|"seller";status:string;offer:string|null;answer:string|null;candidates:RTCIceCandidateInit[]};
export default function LiveRoom({checkId}:{checkId:string}) {
  const local=useRef<HTMLVideoElement>(null),remote=useRef<HTMLVideoElement>(null),peer=useRef<RTCPeerConnection|null>(null),stream=useRef<MediaStream|null>(null);
  const timer=useRef<ReturnType<typeof setTimeout>|null>(null),gone=useRef(false),candidateIndex=useRef(0),negotiating=useRef(false);
  const [message,setMessage]=useState("Join when you and the seller are ready."),[role,setRole]=useState(""),[joining,setJoining]=useState(false),[active,setActive]=useState(false),[muted,setMuted]=useState(false);
  const path=`/api/live-checks/${checkId}`;
  function stop(){gone.current=true;if(timer.current)clearTimeout(timer.current);peer.current?.close();stream.current?.getTracks().forEach(track=>track.stop());peer.current=null;setActive(false);}
  useEffect(()=>()=>{gone.current=true;if(timer.current)clearTimeout(timer.current);peer.current?.close();stream.current?.getTracks().forEach(track=>track.stop());},[]);
  async function api<T>(action:string,data?:unknown):Promise<T>{const response=await fetch(path+"/"+action,{method:data===undefined?"GET":"POST",credentials:"same-origin",cache:"no-store",headers:data===undefined?{}:{"Content-Type":"application/json"},body:data===undefined?undefined:JSON.stringify(data)});const result=await response.json() as T&{error?:string};if(!response.ok)throw new Error(result.error||"The live check could not connect.");return result;}
  async function poll(){if(gone.current||!peer.current)return;try{
    const state=await api<State>("state"),pc=peer.current;if(!pc||gone.current)return;
    if(state.status!=="accepted"){stop();setMessage("This live check has ended. Return to the app.");return;}
    if(!pc.remoteDescription&&!negotiating.current){
      if(state.role==="seller"&&state.offer){negotiating.current=true;try{await pc.setRemoteDescription({type:"offer",sdp:state.offer});await pc.setLocalDescription(await pc.createAnswer());await api("signals",{type:"answer",sdp:pc.localDescription?.sdp});}finally{negotiating.current=false;}}
      if(state.role==="buyer"&&state.answer){negotiating.current=true;try{await pc.setRemoteDescription({type:"answer",sdp:state.answer});}finally{negotiating.current=false;}}
    }
    if(pc.remoteDescription){while(candidateIndex.current<state.candidates.length){await pc.addIceCandidate(state.candidates[candidateIndex.current]);candidateIndex.current++;}}
  }catch(error){stop();setMessage(error instanceof Error?error.message:"The live check could not connect.");return;}
    if(!gone.current)timer.current=setTimeout(poll,2500);
  }
  async function join(){setJoining(true);try{
    const state=await api<State>("state"),ice=await api<{iceServers:RTCIceServer[]}>("ice");setRole(state.role);
    if(!navigator.mediaDevices?.getUserMedia||typeof RTCPeerConnection==="undefined")throw new Error("Open this live check in a browser that supports video calls.");
    gone.current=false;candidateIndex.current=0;
    const media=await navigator.mediaDevices.getUserMedia(state.role==="seller"?{video:{facingMode:{ideal:"environment"},width:{ideal:640},height:{ideal:480}},audio:true}:{video:false,audio:true});
    stream.current=media;if(local.current)local.current.srcObject=media;
    const pc=new RTCPeerConnection({iceServers:ice.iceServers});peer.current=pc;
    media.getTracks().forEach(track=>pc.addTrack(track,media));
    if(state.role==="buyer")pc.addTransceiver("video",{direction:"recvonly"});
    pc.ontrack=event=>{if(remote.current){remote.current.srcObject=event.streams[0]||new MediaStream([event.track]);remote.current.play().catch(()=>setMessage("Tap the video to start playback."));}};
    pc.onicecandidate=event=>{if(event.candidate&&!gone.current)api("signals",{type:"ice",candidate:event.candidate.toJSON()}).catch(error=>setMessage(error.message));};
    pc.onconnectionstatechange=()=>{if(gone.current)return;if(pc.connectionState==="connected")setMessage(state.role==="buyer"?"You are seeing the seller’s goods live. Ask them to show the condition and details.":"You are live. Point your camera at the goods and show the buyer the details.");if(pc.connectionState==="failed"){stop();setMessage("The call could not connect on this network. Try Wi-Fi and request a new live check.");}if(pc.connectionState==="disconnected")setMessage("Connection interrupted. Waiting to reconnect…");};
    if(state.role==="buyer"){await pc.setLocalDescription(await pc.createOffer());await api("signals",{type:"offer",sdp:pc.localDescription?.sdp});}
    setActive(true);setMessage(state.role==="buyer"?"Waiting for the seller to join…":"Waiting for the buyer to join…");await poll();
  }catch(error){stop();setMessage(error instanceof Error?error.message:"Camera or microphone access could not start.");}finally{setJoining(false);}}
  async function end(){try{await api("end",{});}catch{}stop();setMessage("Call ended. Return to NyazuraMusika to confirm your inspection or view the request.");}
  function mute(){const next=!muted;stream.current?.getAudioTracks().forEach(track=>{track.enabled=!next;});setMuted(next);}
  return <main style={{maxWidth:900,padding:"24px",margin:"20px auto"}}><span className="mark">N</span><p className="eyebrow">NYAZURAMUSIKA LIVE CHECK</p><h1 style={{fontSize:"2rem"}}>Inspect the goods together.</h1><p role="status">{message}</p>
    <div style={{background:"#0b1722",borderRadius:16,overflow:"hidden",margin:"20px 0"}}><video ref={remote} autoPlay playsInline controls={false} onClick={event=>event.currentTarget.play()} style={{display:role==="seller"?"none":"block",width:"100%",minHeight:220}}/><video ref={local} autoPlay muted playsInline style={{display:role==="seller"?"block":"none",width:"100%",minHeight:220}}/></div>
    {!active?<button className="button" onClick={join} disabled={joining}>{joining?"Connecting…":"Join live check"}</button>:<div style={{display:"flex",gap:12,flexWrap:"wrap"}}><button className="button" onClick={mute}>{muted?"Unmute microphone":"Mute microphone"}</button><button className="button" onClick={end}>End live check</button></div>}
    <p style={{fontSize:"1rem"}}>The seller shares their camera. The buyer can talk through their microphone. Video and audio are not recorded by NyazuraMusika.</p><a className="quiet" href="nyazuramusika://home">Return to the Android app</a></main>;
}
