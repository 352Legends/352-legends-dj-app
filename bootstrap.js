import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.112.4';
window.__createClient=createClient;
for (const src of ['./core-v3.js?v=uat-premium-v3','./app-part4.js?v=uat-premium-v3','./app-part3.js?v=uat-premium-v3']) {
  await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=src;s.onload=resolve;s.onerror=()=>reject(new Error('Failed to load '+src));document.body.appendChild(s);});
}
