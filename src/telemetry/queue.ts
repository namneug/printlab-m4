/**
 * คิวส่ง event แบบทนเน็ตหลุด — เก็บลง IndexedDB ก่อนเสมอ แล้วส่งซ้ำไป endpoint เมื่อออนไลน์
 * ถ้าไม่ตั้ง VITE_EVENTS_ENDPOINT (เช่น GitHub Pages) ข้อมูลจะอยู่ในเครื่องและส่งออกเป็นไฟล์ได้
 */
import { STORES, putAll, getAll, getByIndex, count } from './idb';
import type { GameEvent } from './schema';

export interface StoredEvent extends GameEvent {
  /** 0 = ยังไม่ส่ง, 1 = ส่งแล้ว (ไม่ถูกส่งออกในไฟล์) */
  sent: 0 | 1;
}

const ENDPOINT = (import.meta.env['VITE_EVENTS_ENDPOINT'] as string | undefined)?.trim() ?? '';
const BATCH = 100;
const FLUSH_INTERVAL = 30_000;

let flushing = false;
let timer = 0;
const listeners = new Set<() => void>();

export function onQueueChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify(): void {
  for (const fn of listeners) fn();
}

export async function enqueue(ev: GameEvent): Promise<void> {
  const stored: StoredEvent = { ...ev, sent: 0 };
  try {
    await putAll(STORES.events, [stored]);
  } catch (err) {
    console.warn('บันทึก event ลง IndexedDB ไม่สำเร็จ', err);
  }
  notify();
  if (ENDPOINT) void flush();
}

export async function pendingCount(): Promise<number> {
  const rows = await getByIndex<StoredEvent>(STORES.events, 'sent', 0);
  return rows.length;
}

export async function totalCount(): Promise<number> {
  return count(STORES.events);
}

export async function allEvents(): Promise<StoredEvent[]> {
  const rows = await getAll<StoredEvent>(STORES.events);
  return rows.sort((a, b) => a.clientTs.localeCompare(b.clientTs));
}

export function endpointConfigured(): boolean {
  return ENDPOINT.length > 0;
}

/** ส่ง event ที่ค้างอยู่เป็นชุด คืนจำนวนที่ส่งสำเร็จ */
export async function flush(): Promise<number> {
  if (!ENDPOINT || flushing) return 0;
  if (typeof navigator !== 'undefined' && !navigator.onLine) return 0;
  flushing = true;
  let sentTotal = 0;
  try {
    const pending = await getByIndex<StoredEvent>(STORES.events, 'sent', 0);
    for (let i = 0; i < pending.length; i += BATCH) {
      const batch = pending.slice(i, i + BATCH);
      const body = batch.map(({ sent: _s, ...ev }) => ev);
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ events: body }),
        keepalive: true,
      });
      if (!res.ok) break;
      await putAll(STORES.events, batch.map((e) => ({ ...e, sent: 1 as const })));
      sentTotal += batch.length;
    }
  } catch {
    /* เน็ตหลุด — รอรอบถัดไป */
  } finally {
    flushing = false;
    if (sentTotal) notify();
  }
  return sentTotal;
}

export function startQueue(): void {
  if (!ENDPOINT) return;
  window.addEventListener('online', () => void flush());
  timer = window.setInterval(() => void flush(), FLUSH_INTERVAL);
  void flush();
}

export function stopQueue(): void {
  window.clearInterval(timer);
}
