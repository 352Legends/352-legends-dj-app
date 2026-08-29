import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.112.4';
window.__createClient=createClient;
for (const src of ['./app-part1.js','./app-part2.js','./app-part3.js','./app-part4.js','./sprint6.js','./sprint7.js']) {
  await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=src;s.onload=resolve;s.onerror=reject;document.body.appendChild(s);});
}
