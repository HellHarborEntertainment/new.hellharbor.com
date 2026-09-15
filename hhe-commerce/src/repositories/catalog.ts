import type { CartItemInput, CatalogItem, Env, ProviderName } from '../types.js';
import { badRequest, notFound } from '../lib/errors.js';
import { randomId } from '../lib/crypto.js';
interface VariantRow { product_id:string;variant_id:string;sku:string;product_name:string;variant_name:string|null;provider:string;provider_product_id:string|null;provider_sku:string|null;product_price:number;variant_price:number|null;currency:string;product_active:number;variant_active:number; }
export async function resolveCart(env: Env, requested: CartItemInput[]): Promise<CatalogItem[]> {
  if (!Array.isArray(requested)||requested.length===0) throw badRequest('Cart must contain at least one item');
  if (requested.length>50) throw badRequest('Cart contains too many line items');
  const normalized=requested.map(i=>({sku:String(i.sku||'').trim(),quantity:Number(i.quantity)}));
  for(const i of normalized) if(!i.sku||!Number.isInteger(i.quantity)||i.quantity<1||i.quantity>25) throw badRequest('Invalid cart item');
  const unique=[...new Set(normalized.map(i=>i.sku))]; const placeholders=unique.map(()=>'?').join(',');
  const rows=await env.COMMERCE_DB.prepare(`SELECT p.id product_id,v.id variant_id,v.sku,p.name product_name,v.name variant_name,p.provider,p.provider_product_id,v.provider_sku,p.retail_price product_price,v.retail_price variant_price,p.currency,p.active product_active,v.active variant_active FROM product_variants v JOIN products p ON p.id=v.product_id WHERE v.sku IN (${placeholders})`).bind(...unique).all<VariantRow>();
  const map=new Map((rows.results||[]).map(r=>[r.sku,r]));
  return normalized.map(item=>{const r=map.get(item.sku);if(!r||!r.product_active||!r.variant_active) throw badRequest(`SKU is unavailable: ${item.sku}`);return {productId:r.product_id,variantId:r.variant_id,sku:r.sku,productName:r.product_name,variantName:r.variant_name||undefined,provider:r.provider as CatalogItem['provider'],providerProductId:r.provider_product_id||undefined,providerSku:r.provider_sku||undefined,unitPrice:r.variant_price??r.product_price,currency:r.currency,quantity:item.quantity};});
}
export async function listCatalog(env:Env):Promise<unknown[]> { const r=await env.COMMERCE_DB.prepare(`SELECT p.id product_id,p.sku product_sku,p.name,p.description,p.retail_price,p.currency,p.provider,v.id variant_id,v.sku,v.name variant_name,v.retail_price variant_price,v.size,v.color FROM products p JOIN product_variants v ON v.product_id=p.id WHERE p.active=1 AND v.active=1 ORDER BY p.name,v.name`).all();return r.results||[]; }
export interface ProductUpsert { id?:string; sku:string; name:string; description?:string; retailPrice:number; currency?:string; provider:ProviderName; providerProductId?:string; active?:boolean; }
export async function upsertProduct(env:Env,input:ProductUpsert):Promise<string>{
  if(!input.sku?.trim()||!input.name?.trim()||!Number.isInteger(input.retailPrice)||input.retailPrice<0) throw badRequest('Invalid product');
  const id=input.id||randomId('prod'); const now=new Date().toISOString();
  await env.COMMERCE_DB.prepare(`INSERT INTO products (id,sku,name,description,retail_price,currency,provider,provider_product_id,active,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(sku) DO UPDATE SET name=excluded.name,description=excluded.description,retail_price=excluded.retail_price,currency=excluded.currency,provider=excluded.provider,provider_product_id=excluded.provider_product_id,active=excluded.active,updated_at=excluded.updated_at`)
   .bind(id,input.sku.trim(),input.name.trim(),input.description||null,input.retailPrice,(input.currency||'usd').toLowerCase(),input.provider,input.providerProductId||null,input.active===false?0:1,now,now).run();
  const row=await env.COMMERCE_DB.prepare('SELECT id FROM products WHERE sku=?').bind(input.sku.trim()).first<{id:string}>(); return row?.id||id;
}
export interface VariantUpsert { id?:string; productId:string; sku:string; name?:string; size?:string;color?:string;providerSku?:string;retailPrice?:number|null;active?:boolean; }
export async function upsertVariant(env:Env,input:VariantUpsert):Promise<string>{
 if(!input.productId||!input.sku?.trim()) throw badRequest('Invalid variant'); const product=await env.COMMERCE_DB.prepare('SELECT id FROM products WHERE id=?').bind(input.productId).first();if(!product) throw notFound('Product not found');
 const id=input.id||randomId('var');const now=new Date().toISOString();await env.COMMERCE_DB.prepare(`INSERT INTO product_variants (id,product_id,sku,name,size,color,provider_sku,retail_price,active,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(sku) DO UPDATE SET product_id=excluded.product_id,name=excluded.name,size=excluded.size,color=excluded.color,provider_sku=excluded.provider_sku,retail_price=excluded.retail_price,active=excluded.active,updated_at=excluded.updated_at`)
 .bind(id,input.productId,input.sku.trim(),input.name||null,input.size||null,input.color||null,input.providerSku||null,input.retailPrice??null,input.active===false?0:1,now,now).run();const row=await env.COMMERCE_DB.prepare('SELECT id FROM product_variants WHERE sku=?').bind(input.sku.trim()).first<{id:string}>();return row?.id||id;
}
