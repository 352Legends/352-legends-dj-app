import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.112.4';
window.__createClient=createClient;
for (const src of ['./core-v3.js?v=root-clientid-v4','./app-part4.js?v=root-clientid-v4','./app-part3.js?v=root-clientid-v4']) {
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
