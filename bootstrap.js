import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.112.4';
window.__createClient=createClient;

// mobile-first-v23 is the predecessor layout; viewport-fit-v24 adds hard containment.
// Final mobile containment loads after the base styles so dynamically generated
// Soundboard/Admin/player controls can never widen the page past the visual viewport.
const mobileContainment=document.createElement('link');
mobileContainment.rel='stylesheet';
mobileContainment.href='./mobile-containment-v1.css?v=viewport-fit-v24';
document.head.appendChild(mobileContainment);

// GameDay is uploaded-music only. Clear legacy browser authorization state so an old
// published game cannot reactivate the retired streaming integration.
for(const key of ['gameday.spotify.tokens.v3','gameday.spotify.tokens.v2','gameday.spotify.tokens.v1','gameday.spotify.profile.v1','gameday.spotify.auth.status.v1','gameday.spotify.pkce.verifier.v3','gameday.spotify.pkce.client.v3','gameday.spotify.pkce.state.v3','gameday.spotify.pkce.return.v3']){
  try{localStorage.removeItem(key);sessionStorage.removeItem(key);}catch(_e){}
}
try{
  const u=new URL(location.href);
  let changed=false;
  for(const key of ['code','state','error'])if(u.searchParams.has(key)){u.searchParams.delete(key);changed=true;}
  if(changed)history.replaceState(null,'',u.toString());
}catch(_e){}

for(const src of [
  './core-v3.js?v=viewport-fit-v24',
  './local-only-v1.js?v=viewport-fit-v24',
  './local-mixer-v1.js?v=viewport-fit-v24',
  './local-stop-fade-v1.js?v=viewport-fit-v24',
  './app-part4.js?v=viewport-fit-v24',
  './admin-soundboard-order-v1.js?v=viewport-fit-v24',
  './app-part3.js?v=viewport-fit-v24',
  './uploaded-music-v1.js?v=viewport-fit-v24',
  './soundboard-groups-v1.js?v=viewport-fit-v24',
  './soundboard-group-order-v1.js?v=viewport-fit-v24'
]){
  await new Promise((resolve,reject)=>{
    const s=document.createElement('script');
    s.src=src;
    s.onload=resolve;
    s.onerror=()=>reject(new Error('Failed to load '+src));
    document.body.appendChild(s);
  });
}

const params=new URLSearchParams(location.search);
const isOperatorRoot=!params.get('admin')&&!params.get('game');
if(isOperatorRoot&&typeof window.loadPublishedGame==='function')await window.loadPublishedGame('');
