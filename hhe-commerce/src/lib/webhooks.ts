import type { Env } from '../types.js';
import { conflict } from './errors.js';
import { randomId } from './crypto.js';

export interface WebhookClaim { id:string; token:string; }

export async function claimWebhook(env:Env,provider:'stripe'|'spreadconnect',providerEventId:string,eventType:string,payloadSha256:string):Promise<WebhookClaim|null>{
 const now=new Date().toISOString(),candidateId=randomId('evt');await env.COMMERCE_DB.prepare(`INSERT OR IGNORE INTO webhook_events (id,provider,provider_event_id,event_type,payload_json,payload_sha256,received_at) VALUES (?,?,?,?, '{}', ?, ?)`).bind(candidateId,provider,providerEventId,eventType||null,payloadSha256,now).run();
 const row=await env.COMMERCE_DB.prepare('SELECT id,processed_at,payload_sha256 FROM webhook_events WHERE provider=? AND provider_event_id=?').bind(provider,providerEventId).first<{id:string;processed_at:string|null;payload_sha256:string|null}>();if(!row)throw new Error('Webhook ledger row disappeared after insert');if(row.payload_sha256&&row.payload_sha256!==payloadSha256)throw conflict('Webhook event id was reused with a different payload');if(row.processed_at)return null;
 const token=randomId('webhook_claim'),staleBefore=new Date(Date.now()-10*60_000).toISOString();const claimed=await env.COMMERCE_DB.prepare(`UPDATE webhook_events SET processing_token=?,processing_started_at=?,payload_sha256=COALESCE(payload_sha256,?),event_type=COALESCE(event_type,?),last_error=NULL WHERE id=? AND processed_at IS NULL AND (processing_token IS NULL OR processing_started_at IS NULL OR processing_started_at<?)`).bind(token,now,payloadSha256,eventType||null,row.id,staleBefore).run();if(Number(claimed.meta?.changes||0)!==1)throw conflict('Webhook delivery is already being processed');return{id:row.id,token};
}
export async function finishWebhook(env:Env,claim:WebhookClaim):Promise<void>{await env.COMMERCE_DB.prepare(`UPDATE webhook_events SET processed_at=?,processing_token=NULL,processing_started_at=NULL,last_error=NULL,payload_json='{}' WHERE id=? AND processing_token=?`).bind(new Date().toISOString(),claim.id,claim.token).run();}
export async function failWebhook(env:Env,claim:WebhookClaim,error:unknown):Promise<void>{await env.COMMERCE_DB.prepare(`UPDATE webhook_events SET processing_token=NULL,processing_started_at=NULL,last_error=?,payload_json='{}' WHERE id=? AND processing_token=?`).bind(String(error).slice(0,2000),claim.id,claim.token).run();}
