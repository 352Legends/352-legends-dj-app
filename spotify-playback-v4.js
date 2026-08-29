(() => {
  const API_ROOT='https://api.spotify.com/v1/';
  const TOKEN_URL='https://accounts.spotify.com/api/token';
  const GAME_API='https://voynfqugirhtvmmmtpav.supabase.co/functions/v1/published-game';
  const TOKEN_KEY='gameday.spotify.tokens.v3';
  const PATTERN_ERROR=/string did not match the expected pattern/i;
  let busy=false;

  const $=id=>document.getElementById(id);
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const spotifySelected=()=>!$('spotifySourceBtn')||$('spotifySourceBtn').classList.contains('on');
  const livePlay=()=>document.querySelector('#statebar [data-state="LIVE"]')?.getAttribute('aria-pressed')==='true';
  const toast=text=>{const t=$('toast');if(!t)return;t.textContent=text;t.classList.add('on');clearTimeout(window.__spotifyCompatToast);window.__spotifyCompatToast=setTimeout(()=>t.classList.remove('on'),3200);};
  const setStatus=text=>{if($('gdspStatus'))$('gdspStatus').textContent=text;if($('soundboardStartMusicStatus'))$('soundboardStartMusicStatus').textContent=text;};

  function tokenRecord(){try{return JSON.parse(localStorage.getItem(TOKEN_KEY)||'null');}catch(_e){return null;}}
  function saveToken(t){localStorage.setItem(TOKEN_KEY,JSON.stringify(t));return t;}

  async function accessToken(){
    let t=tokenRecord();
    if(!t?.access_token)throw new Error('Connect Spotify Premium first');
    if(Number(t.expires_at||0)>Date.now()+45000)return t.access_token;
    if(!t.refresh_token||!t.client_id)throw new Error('Reconnect Spotify Premium');
    const r=await fetch(TOKEN_URL,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:t.client_id,grant_type:'refresh_token',refresh_token:t.refresh_token})});
    const raw=await r.text();
    let data={};try{data=raw?JSON.parse(raw):{};}catch(_e){}
    if(!r.ok||!data.access_token){localStorage.removeItem(TOKEN_KEY);throw new Error(data.error_description||'Spotify session expired. Reconnect Spotify.');}
    t=saveToken({...t,access_token:data.access_token,refresh_token:data.refresh_token||t.refresh_token,scope:data.scope||t.scope,expires_at:Date.now()+Math.max(60,Number(data.expires_in||3600))*1000});
    return t.access_token;
  }

  function playlistIdentity(value){
    const raw=String(value||'').trim();
    let id='';
    if(/^spotify:playlist:[A-Za-z0-9]{22}$/.test(raw))id=raw.slice('spotify:playlist:'.length);
    else{
      try{
        const u=new URL(raw);
        if(u.hostname!=='open.spotify.com')return null;
        const parts=u.pathname.split('/').filter(Boolean);
        if(parts[0]!=='playlist'||!parts[1])return null;
        id=parts[1];
      }catch(_e){return null;}
    }
    if(!/^[A-Za-z0-9]{22}$/.test(id))return null;
    return {id,uri:'spotify:playlist:'+id};
  }

  function apiUrl(path){
    const clean=String(path||'').replace(/^\/+/, '');
    return new URL(clean,API_ROOT).href;
  }

  function xhrRequest(url,method,token,body){
    return new Promise((resolve,reject)=>{
      const x=new XMLHttpRequest();
      try{x.open(method,url,true);}catch(e){reject(e);return;}
      x.setRequestHeader('Authorization','Bearer '+token);
      if(body!=null)x.setRequestHeader('Content-Type','application/json');
      x.onload=()=>resolve({status:x.status,headers:{get:()=>null},text:async()=>x.responseText||''});
      x.onerror=()=>reject(new Error('Spotify network request failed'));
      x.send(body??null);
    });
  }

  async function request(path,options={}){
    const token=await accessToken();
    const url=apiUrl(path);
    const method=String(options.method||'GET').toUpperCase();
    const body=options.body??null;
    let r;
    try{
      r=await fetch(url,{...options,method,body,headers:{Authorization:'Bearer '+token,...(body!=null?{'Content-Type':'application/json'}:{}),...(options.headers||{})}});
    }catch(e){
      if(!PATTERN_ERROR.test(String(e?.message||e)))throw e;
      r=await xhrRequest(url,method,token,body);
    }
    const raw=await r.text();
    let data=null;
    if(raw){try{data=JSON.parse(raw);}catch(_e){data=raw;}}
    if(r.status===429){const retry=Number(r.headers?.get?.('Retry-After')||5);throw new Error('Spotify rate limit reached. Try again in '+Math.max(1,retry)+' seconds.');}
    if(r.status<200||r.status>=300){
      const detail=data?.error?.message||data?.message||String(data||'');
      if(r.status===403)throw new Error(detail||'Spotify Premium, app access, or playback permission is required.');
      if(r.status===404)throw new Error(detail||'No Spotify playback device is available.');
      throw new Error(detail||('Spotify playback request failed ('+r.status+')'));
    }
    return data;
  }

  async function gameConfig(){
    const slug=new URLSearchParams(location.search).get('game')||'';
    const u=new URL(GAME_API);if(slug)u.searchParams.set('slug',slug);
    const r=await fetch(u.href,{cache:'no-store'});
    const raw=await r.text();let data={};try{data=raw?JSON.parse(raw):{};}catch(_e){}
    if(!r.ok)throw new Error(data?.error||'Unable to load the published game');
    return data;
  }

  async function devices(){const d=await request('me/player/devices');return (d?.devices||[]).filter(x=>x?.id&&!x.is_restricted);}
  async function chooseDevice(){
    const list=await devices();
    const selected=$('gdspDeviceSelect')?.value||'';
    return list.find(d=>d.id===selected)||list.find(d=>d.is_active)||list.find(d=>/GameDay Browser Player/i.test(d.name||''))||list[0]||null;
  }
  async function transfer(device){await request('me/player',{method:'PUT',body:JSON.stringify({device_ids:[device.id],play:false})});await sleep(180);}
  function randomInt(max){if(max<=1)return 0;const a=new Uint32Array(1);crypto.getRandomValues(a);return Math.floor((a[0]/4294967296)*max);}

  async function playlistTotal(id){
    try{const p=await request('playlists/'+encodeURIComponent(id));return Number(p?.items?.total||0);}catch(_e){return 0;}
  }

  async function startRandom(){
    if(busy)return;
    if(livePlay())return toast('Music locked during LIVE PLAY');
    busy=true;
    const b=$('soundboardStartMusic');const old=b?.textContent;
    if(b){b.disabled=true;b.textContent='STARTING SPOTIFY…';}
    setStatus('Starting the published Spotify Premium playlist…');
    try{
      const game=await gameConfig();
      const playlist=playlistIdentity(game.spotifyUrl);
      if(!playlist)throw new Error('Published Spotify playlist URL is invalid.');
      let device=await chooseDevice();
      if(!device)throw new Error('No Spotify device is available. Open Spotify once or wait for the GameDay Browser Player to appear.');
      if(!device.is_active){await transfer(device);device={...device,is_active:true};}
      const total=await playlistTotal(playlist.id);
      const body={context_uri:playlist.uri,position_ms:0};
      if(total>0)body.offset={position:randomInt(total)};
      else{try{await request('me/player/shuffle?state=true',{method:'PUT'});}catch(_e){}}
      // Target the active device after transfer. Omitting device_id avoids a Safari/WebKit
      // URL-pattern failure seen on some mobile playback requests.
      await request('me/player/play',{method:'PUT',body:JSON.stringify(body)});
      if(total<=0){await sleep(220);try{await request('me/player/next',{method:'POST'});}catch(_e){}}
      setStatus(total>0?'Random playlist track started.':'Playlist started in Spotify shuffle mode.');
      toast('▶ Spotify music started');
      setTimeout(()=>window.__gamedayDebug?.refreshSpotify?.(),250);
    }catch(e){
      const m=String(e?.message||e||'Unable to start Spotify');
      if(PATTERN_ERROR.test(m)){
        setStatus('Safari blocked the Spotify request even after compatibility retry. Open Spotify once so a device is active, then tap START MUSIC again.');
        toast('Spotify browser compatibility retry needed');
      }else{setStatus(m);toast(m);}
    }finally{busy=false;if(b){b.disabled=false;b.textContent=old||'▶ START MUSIC';}}
  }

  async function next(){
    if(livePlay())return toast('Music locked during LIVE PLAY');
    try{const d=await chooseDevice();if(d&&!d.is_active)await transfer(d);await request('me/player/next',{method:'POST'});toast('Next Spotify track');setTimeout(()=>window.__gamedayDebug?.refreshSpotify?.(),250);}catch(e){toast(String(e?.message||e));}
  }
  async function previous(){
    if(livePlay())return toast('Music locked during LIVE PLAY');
    try{const d=await chooseDevice();if(d&&!d.is_active)await transfer(d);await request('me/player/previous',{method:'POST'});setTimeout(()=>window.__gamedayDebug?.refreshSpotify?.(),250);}catch(e){toast(String(e?.message||e));}
  }

  function wire(){
    const start=$('soundboardStartMusic');if(start)start.onclick=startRandom;
    const nextTop=$('nextTrackBtn');if(nextTop&&!nextTop.dataset.spotifyCompat){const original=nextTop.onclick;nextTop.dataset.spotifyCompat='1';nextTop.onclick=e=>spotifySelected()?next():original?.call(nextTop,e);}
    const gdNext=$('gdspNext');if(gdNext)gdNext.onclick=next;
    const gdPrev=$('gdspPrev');if(gdPrev)gdPrev.onclick=previous;
    const master=$('stopMusic');if(master&&!master.dataset.spotifyCompat){const original=master.onclick;master.dataset.spotifyCompat='1';master.onclick=e=>{if(spotifySelected()&&master.textContent.includes('START MUSIC'))return startRandom();return original?.call(master,e);};}
    const play=$('musicPlayBtn');if(play&&!play.dataset.spotifyCompat){const original=play.onclick;play.dataset.spotifyCompat='1';play.onclick=e=>{if(spotifySelected()&&play.textContent.includes('PLAY MUSIC'))return startRandom();return original?.call(play,e);};}
  }

  window.__gamedaySpotifyPlaybackV4={startRandom,next,previous,playlistIdentity,request};
  wire();
  setTimeout(wire,300);
  window.addEventListener('focus',wire);
})();