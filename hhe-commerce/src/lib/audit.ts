import type { Env } from '../types.js';
import { randomId } from './crypto.js';

export interface AuditInput { actorType: 'system'|'admin'|'stripe'|'spreadconnect'|'customer'; actorId?: string; action: string; entityType: string; entityId?: string; metadata?: unknown; requestId?: string; }
export async function audit(env: Env, entry: AuditInput): Promise<void> {
  await env.COMMERCE_DB.prepare(`INSERT INTO audit_log (id, actor_type, actor_id, action, entity_type, entity_id, metadata_json, request_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(randomId('audit'), entry.actorType, entry.actorId || null, entry.action, entry.entityType, entry.entityId || null, entry.metadata === undefined ? null : JSON.stringify(entry.metadata), entry.requestId || null, new Date().toISOString()).run();
}
