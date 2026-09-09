/** ตัวจ่ายจังหวะเฟรมกลาง — ทุกอย่างที่ต้องอัปเดตต่อเฟรม (แอนิเมชัน tween ฯลฯ) ลงทะเบียนที่นี่ */
type TickFn = (dt: number, elapsed: number) => void;

const fns = new Set<TickFn>();
let elapsed = 0;

export const ticker = {
  add(fn: TickFn): () => void {
    fns.add(fn);
    return () => {
      fns.delete(fn);
    };
  },
  update(dt: number): void {
    elapsed += dt;
    for (const fn of fns) fn(dt, elapsed);
  },
  get elapsed(): number {
    return elapsed;
  },
};

/** ทวีนค่าจาก 0→1 ตามระยะเวลา (วินาที) พร้อม easing แบบ smoothstep */
export function tween(
  duration: number,
  onUpdate: (t: number) => void,
  onDone?: () => void,
): () => void {
  let t = 0;
  const stop = ticker.add((dt) => {
    t = Math.min(1, t + dt / duration);
    const e = t * t * (3 - 2 * t);
    onUpdate(e);
    if (t >= 1) {
      stop();
      onDone?.();
    }
  });
  return stop;
}
