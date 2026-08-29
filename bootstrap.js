import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.112.4';
window.__createClient=createClient;

// Spotify's PKCE redirect can leave the current browser session on mobile
// (for example when the Spotify app handles sign-in). Mirror only the short-
// lived PKCE transaction keys into localStorage so the callback can finish
// even when sessionStorage comes back empty. Spotify's own PKCE examples use
// localStorage for the verifier for this reason.
const SPOTIFY_PKCE_KEYS=new Set([
  'gameday.spotify.pkce.verifier.v3',
  'gameday.spotify.pkce.client.v3',
  'gameday.spotify.pkce.state.v3',
  'gameday.spotify.pkce.return.v3'
]);
const SPOTIFY_PKCE_MIRROR_PREFIX='gameday.spotify.pkce.persist.';
const SPOTIFY_PKCE_TTL_MS=15*60*1000;
const storageProto=Storage.prototype;
const nativeGet=storageProto.getItem;
const nativeSet=storageProto.setItem;
const nativeRemove=storageProto.removeItem;
const nativeClear=storageProto.clear;
const isSessionStore=store=>store===window.sessionStorage;
const mirrorKey=key=>SPOTIFY_PKCE_MIRROR_PREFIX+key;

storageProto.setItem=function(key,value){
  const result=nativeSet.call(this,key,value);
  if(isSessionStore(this)&&SPOTIFY_PKCE_KEYS.has(String(key))){
    try{nativeSet.call(localStorage,mirrorKey(String(key)),JSON.stringify({value:String(value),createdAt:Date.now()}));}catch(_e){}
  }
  return result;
};
storageProto.getItem=function(key){
  let value=nativeGet.call(this,key);
  if(value!==null||!isSessionStore(this)||!SPOTIFY_PKCE_KEYS.has(String(key)))return value;
  try{
    const raw=nativeGet.call(localStorage,mirrorKey(String(key)));
    if(!raw)return null;
    const saved=JSON.parse(raw);
    if(!saved||Date.now()-Number(saved.createdAt||0)>SPOTIFY_PKCE_TTL_MS){nativeRemove.call(localStorage,mirrorKey(String(key)));return null;}
    value=String(saved.value??'');
    nativeSet.call(this,key,value);
    return value;
  }catch(_e){return null;}
};
storageProto.removeItem=function(key){
  const result=nativeRemove.call(this,key);
  if(isSessionStore(this)&&SPOTIFY_PKCE_KEYS.has(String(key))){try{nativeRemove.call(localStorage,mirrorKey(String(key)));}catch(_e){}}
  return result;
};
storageProto.clear=function(){
  const session=isSessionStore(this);
  const result=nativeClear.call(this);
  if(session){for(const key of SPOTIFY_PKCE_KEYS){try{nativeRemove.call(localStorage,mirrorKey(key));}catch(_e){}}}
  return result;
};
window.__gamedaySpotifyPkceBridge={
  ready:true,
  keys:[...SPOTIFY_PKCE_KEYS],
  mirrorPrefix:SPOTIFY_PKCE_MIRROR_PREFIX
};

for (const src of ['./core-v3.js?v=spotify-auth-v5','./app-part4.js?v=spotify-auth-v5','./app-part3.js?v=spotify-auth-v5']) {
  await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=src;s.onload=resolve;s.onerror=()=>reject(new Error('Failed to load '+src));document.body.appendChild(s);});
}

// The plain GameDay URL is the league Home screen. Load the most recently
// published game so Spotify playlist/Client ID and the published soundboard
// are available even when the URL does not contain ?game=<slug>.
const params=new URLSearchParams(location.search);
const isOperatorRoot=!params.get('admin')&&!params.get('game')&&!params.get('code')&&!params.get('error');
if(isOperatorRoot&&typeof window.loadPublishedGame==='function'){
  await window.loadPublishedGame('');
}

function readSpotifyTokenRecord(){
  try{return JSON.parse(localStorage.getItem('gameday.spotify.tokens.v3')||'null');}catch(_e){return null;}
}
function syncSpotifyHeader(){
  const button=document.getElementById('spotifyConnectBtn');
  const status=document.getElementById('spotifyConnectStatus');
  if(!button||!status)return;
  const token=readSpotifyTokenRecord();
  const state=window.__gamedayDebug?.state?.()||{};
  const authorized=!!token?.access_token&&!state.spotifyNeedsScopeUpgrade;
  if(state.spotifyAccountError){
    button.textContent='RECONNECT SPOTIFY';
    status.textContent='Spotify login succeeded, but this account was rejected for Premium playback.';
  }else if(state.spotifyNeedsScopeUpgrade){
    button.textContent='RECONNECT SPOTIFY';
    status.textContent='Spotify authorization needs updated Premium playback permissions.';
  }else if(authorized&&state.spotifySdkReady){
    button.textContent='DISCONNECT SPOTIFY';
    status.textContent='Spotify Premium connected • GameDay player ready.';
  }else if(authorized){
    button.textContent='DISCONNECT SPOTIFY';
    status.textContent='Spotify Premium authorized • connecting the GameDay player…';
  }else{
    button.textContent='CONNECT SPOTIFY';
    status.textContent='Spotify Premium is not connected.';
  }
}
window.__gamedaySyncSpotifyHeader=syncSpotifyHeader;
syncSpotifyHeader();
setInterval(syncSpotifyHeader,1000);
window.addEventListener('focus',syncSpotifyHeader);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)syncSpotifyHeader();});
