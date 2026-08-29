import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.112.4';
window.__createClient=createClient;
try {
  const legacy=localStorage.getItem('gameday.spotify.tokens.v1');
  if (legacy && !localStorage.getItem('gameday.spotify.tokens.v2')) localStorage.setItem('gameday.spotify.tokens.v2',legacy);
} catch (_) {}
for (const src of ['./core-v2.js','./app-part4.js','./app-part3.js']) {
  await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=src;s.onload=resolve;s.onerror=reject;document.body.appendChild(s);});
}
