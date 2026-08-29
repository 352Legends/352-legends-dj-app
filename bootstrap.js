import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.112.4';
window.__createClient=createClient;

const SPOTIFY_AUTH_ENDPOINT='https://voynfqugirhtvmmmtpav.supabase.co/functions/v1/spotify-auth';
const SPOTIFY_TOKEN_KEY='gameday.spotify.tokens.v3';
const SPOTIFY_PROFILE_KEY='gameday.spotify.profile.v1';
const SPOTIFY_STATUS_KEY='gameday.spotify.auth.status.v1';
const APP_HOME='https://352legends.github.io/352-legends-dj-app/';

function isAppleWebKit(){
  const ua=String(navigator.userAgent||'');
  const platform=String(navigator.platform||'');
  const ios=/iPad|iPhone|iPod/.test(ua)||(platform==='MacIntel'&&Number(navigator.maxTouchPoints||0)>1);
  const safari=/Safari\//.test(ua)&&!/Chrome|Chromium|CriOS|FxiOS|EdgiOS|OPiOS|Android/.test(ua);
  return ios||safari;
}
const APPLE_SPOTIFY_CONNECT_MODE=isAppleWebKit();
window.__gamedayAppleSpotifyConnectMode=APPLE_SPOTIFY_CONNECT_MODE;

function installAppleSdkBlocker(){
  if(!APPLE_SPOTIFY_CONNECT_MODE)return;
  const original=document.body.appendChild.bind(document.body);
  document.body.appendChild=function(node){
    const src=String(node?.src||'');
    if(node?.tagName==='SCRIPT'&&src.includes('sdk.scdn.co/spotify-player.js')){
      setTimeout(()=>{try{node.onerror?.(new Event('error'));}catch(_e){}},0);
      return node;
    }
    return original(node);
  };
}

function saveSpotifyStatus(status){
  try{localStorage.setItem(SPOTIFY_STATUS_KEY,JSON.stringify({...status,at:Date.now()}));}catch(_e){}
}
function readSpotifyStatus(){
  try{return JSON.parse(localStorage.getItem(SPOTIFY_STATUS_KEY)||'null');}catch(_e){return null;}
}
function readSpotifyTokenRecord(){
  try{return JSON.parse(localStorage.getItem(SPOTIFY_TOKEN_KEY)||'null');}catch(_e){return null;}
}
function cleanCurrentUrl(){
  try{
    const u=new URL(location.href);
    ['code','state','error'].forEach(k=>u.searchParams.delete(k));
    return u.toString();
  }catch(_e){return APP_HOME;}
}
function friendlySpotifyError(code,detail=''){
  const d=String(detail||'').trim();
  if(code==='SPOTIFY_ACCOUNT_NOT_ALLOWED')return 'Spotify login succeeded, but this account is not authorized for this Development Mode app. Add the Spotify account under Developer Dashboard → Users and Access.';
  if(code==='SPOTIFY_PREMIUM_REQUIRED')return 'Spotify login succeeded, but the account is not an active Premium account.';
  if(code==='TOKEN_EXCHANGE_FAILED')return 'Spotify login returned, but GameDay could not complete the token exchange'+(d?': '+d:'.');
  if(code==='OAUTH_STATE_NOT_FOUND'||code==='OAUTH_STATE_EXPIRED')return 'The Spotify login session expired. Tap Connect Spotify and try again.';
  if(code==='access_denied')return 'Spotify permission was not granted. Tap Connect Spotify to try again.';
  return d||String(code||'Spotify connection failed.');
}

async function handleServerSpotifyCallback(){
  const params=new URLSearchParams(location.search);
  const code=params.get('code');
  const state=params.get('state');
  const error=params.get('error');
  if(!code&&!error)return false;

  if(error){
    saveSpotifyStatus({ok:false,error,detail:friendlySpotifyError(error)});
    location.replace(APP_HOME);
    return true;
  }
  if(!code||!state){
    saveSpotifyStatus({ok:false,error:'MISSING_OAUTH_CALLBACK',detail:'Spotify returned an incomplete authorization response.'});
    location.replace(APP_HOME);
    return true;
  }

  try{
    const r=await fetch(SPOTIFY_AUTH_ENDPOINT,{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({action:'exchange',code,state})
    });
    let body={};
    try{body=await r.json();}catch(_e){}
    const returnUrl=body.return_url||APP_HOME;
    if(!r.ok||!body.ok||!body.token?.access_token){
      const detail=friendlySpotifyError(body.error,body.detail);
      localStorage.removeItem(SPOTIFY_TOKEN_KEY);
      saveSpotifyStatus({ok:false,error:body.error||'SPOTIFY_CONNECTION_FAILED',detail});
      location.replace(returnUrl);
      return true;
    }
    const token={
      access_token:body.token.access_token,
      refresh_token:body.token.refresh_token||'',
      expires_at:Date.now()+Math.max(60,Number(body.token.expires_in||3600))*1000,
      client_id:body.token.client_id||'',
      scope:body.token.scope||''
    };
    localStorage.setItem(SPOTIFY_TOKEN_KEY,JSON.stringify(token));
    localStorage.setItem(SPOTIFY_PROFILE_KEY,JSON.stringify(body.profile||{}));
    saveSpotifyStatus({ok:true,detail:'Spotify Premium authorized successfully.'});
    location.replace(returnUrl);
    return true;
  }catch(err){
    localStorage.removeItem(SPOTIFY_TOKEN_KEY);
    saveSpotifyStatus({ok:false,error:'SPOTIFY_BRIDGE_UNAVAILABLE',detail:'GameDay could not reach the Spotify authorization bridge: '+(err?.message||'network error')});
    location.replace(APP_HOME);
    return true;
  }
}

async function startServerSpotifyAuth(){
  const status=document.getElementById('spotifyConnectStatus');
  const button=document.getElementById('spotifyConnectBtn');
  if(button)button.disabled=true;
  if(status)status.textContent='Opening Spotify secure login…';
  try{
    const params=new URLSearchParams(location.search);
    const slug=params.get('game')||'';
    const r=await fetch(SPOTIFY_AUTH_ENDPOINT,{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({action:'start',slug,return_url:cleanCurrentUrl()})
    });
    let body={};
    try{body=await r.json();}catch(_e){}
    if(!r.ok||!body.auth_url)throw new Error(body.detail||body.error||'Unable to start Spotify login');
    saveSpotifyStatus({ok:null,detail:'Spotify login started.'});
    location.assign(body.auth_url);
  }catch(err){
    const detail=err?.message||'Unable to start Spotify login';
    saveSpotifyStatus({ok:false,error:'SPOTIFY_AUTH_START_FAILED',detail});
    if(status)status.textContent='Spotify connection error: '+detail;
    if(button)button.disabled=false;
  }
}

function disconnectSpotifySession(){
  localStorage.removeItem(SPOTIFY_TOKEN_KEY);
  localStorage.removeItem(SPOTIFY_PROFILE_KEY);
  localStorage.removeItem(SPOTIFY_STATUS_KEY);
  location.reload();
}

const callbackHandled=await handleServerSpotifyCallback();
if(!callbackHandled){
  installAppleSdkBlocker();
  for(const src of ['./core-v3.js?v=chrome-browser-audio-v9','./spotify-playback-v4.js?v=chrome-browser-audio-v9','./spotify-browser-player-v5.js?v=chrome-browser-audio-v9','./app-part4.js?v=chrome-browser-audio-v9','./app-part3.js?v=chrome-browser-audio-v9']){
    await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=src;s.onload=resolve;s.onerror=()=>reject(new Error('Failed to load '+src));document.body.appendChild(s);});
  }

  const params=new URLSearchParams(location.search);
  const isOperatorRoot=!params.get('admin')&&!params.get('game');
  if(isOperatorRoot&&typeof window.loadPublishedGame==='function')await window.loadPublishedGame('');

  function wireSpotifyButtons(){
    const connected=!!readSpotifyTokenRecord()?.access_token;
    const handler=()=>connected?disconnectSpotifySession():startServerSpotifyAuth();
    const top=document.getElementById('spotifyConnectBtn');
    const player=document.getElementById('gdspConnect');
    if(top)top.onclick=handler;
    if(player)player.onclick=handler;
  }

  function syncSpotifyHeader(){
    const button=document.getElementById('spotifyConnectBtn');
    const status=document.getElementById('spotifyConnectStatus');
    if(!button||!status)return;
    const token=readSpotifyTokenRecord();
    const last=readSpotifyStatus();
    const state=window.__gamedayDebug?.state?.()||{};
    const authorized=!!token?.access_token&&!state.spotifyNeedsScopeUpgrade;
    button.disabled=false;
    if(state.spotifyAccountError){
      button.textContent='RECONNECT SPOTIFY';
      status.textContent='Spotify authorized, but the account was rejected for Premium playback.';
    }else if(state.spotifyNeedsScopeUpgrade){
      button.textContent='RECONNECT SPOTIFY';
      status.textContent='Spotify authorization is missing required Premium playback permissions.';
    }else if(APPLE_SPOTIFY_CONNECT_MODE&&authorized){
      button.textContent='DISCONNECT SPOTIFY';
      status.textContent='Spotify Premium connected • Apple device uses Spotify Connect mode.';
    }else if(authorized&&state.spotifySdkReady){
      button.textContent='DISCONNECT SPOTIFY';
      status.textContent='Spotify Premium connected • GameDay Browser Player ready in this tab.';
    }else if(authorized){
      button.textContent='DISCONNECT SPOTIFY';
      status.textContent='Spotify Premium authorized • starting the GameDay Browser Player…';
    }else if(last?.ok===false&&Date.now()-Number(last.at||0)<30*60*1000){
      button.textContent='CONNECT SPOTIFY';
      status.textContent=last.detail||friendlySpotifyError(last.error);
    }else{
      button.textContent='CONNECT SPOTIFY';
      status.textContent='Spotify Premium is not connected.';
    }
    wireSpotifyButtons();
  }

  window.__gamedaySyncSpotifyHeader=syncSpotifyHeader;
  syncSpotifyHeader();
  setInterval(syncSpotifyHeader,1000);
  window.addEventListener('focus',syncSpotifyHeader);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)syncSpotifyHeader();});
}
