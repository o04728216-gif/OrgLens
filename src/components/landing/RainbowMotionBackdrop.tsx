import React, { useEffect, useRef } from 'react';

interface RainbowMotionBackdropProps {
  theme: 'dark' | 'light';
}

interface MicroDot {
  anchorU: number;
  anchorV: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  tone: 'red' | 'yellow';
  shadeIdx: number;
  driftAmp: number;
  driftSpeed: number;
  phase: number;
}

const RED_DARK_PALETTE = ['28, 107, 126', '70, 143, 161', '14, 59, 71'] as const;
const RED_LIGHT_PALETTE = ['14, 59, 71', '28, 107, 126', '49, 80, 91'] as const;
const YELLOW_DARK_PALETTE = [
  '232, 212, 56',
  '242, 224, 86',
  '214, 190, 28',
] as const;
const YELLOW_LIGHT_PALETTE = [
  '214, 190, 28',
  '173, 150, 14',
  '232, 212, 56',
] as const;

export const RainbowMotionBackdrop: React.FC<RainbowMotionBackdropProps> = ({
  theme,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    const reducedMotionQuery = window.matchMedia(
      '(prefers-reduced-motion: reduce)'
    );
    let prefersReduced = reducedMotionQuery.matches;

    let width = window.innerWidth;
    let height = window.innerHeight;
    let dpr = Math.min(window.devicePixelRatio || 1, 2);

    const buildDots = (w: number, h: number): MicroDot[] => {
      const spacing = w < 640 ? 48 : 54;
      const cols = Math.max(10, Math.min(34, Math.ceil(w / spacing)));
      const rows = Math.max(8, Math.min(24, Math.ceil(h / spacing)));
      const list: MicroDot[] = [];

      let idx = 0;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          idx++;
          // Deterministic organic jitter so the tiny dots feel airy rather than rigid
          const jitterX = (((idx * 73) % 100) / 100 - 0.5) * 0.68;
          const jitterY = (((idx * 41) % 100) / 100 - 0.5) * 0.68;
          const u = Math.min(0.985, Math.max(0.015, (c + 0.5 + jitterX) / cols));
          const v = Math.min(0.985, Math.max(0.015, (r + 0.5 + jitterY) / rows));
          const px = u * w;
          const py = v * h;

          list.push({
            anchorU: u,
            anchorV: v,
            x: px,
            y: py,
            vx: 0,
            vy: 0,
            // Crisp tiny dots: 0.95px to 2.05px radius
            radius: 0.95 + ((idx * 19) % 5) * 0.27,
            tone: (r + c + (idx % 2)) % 2 === 0 ? 'red' : 'yellow',
            shadeIdx: idx % 3,
            driftAmp: 4.5 + (idx % 4) * 2.2,
            driftSpeed: 0.55 + (idx % 5) * 0.16,
            phase: idx * 0.83,
          });
        }
      }
      return list;
    };

    let dots: MicroDot[] = [];

    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      dots = buildDots(width, height);
    };
    resize();

    const pointer = {
      targetX: width * 0.45,
      targetY: height * 0.38,
      x: width * 0.45,
      y: height * 0.38,
      lastRawX: width * 0.45,
      lastRawY: height * 0.38,
      vx: 0,
      vy: 0,
      shakeEnergy: 0,
      active: false,
    };

    const onPointerMove = (e: PointerEvent | MouseEvent) => {
      const dx = e.clientX - pointer.lastRawX;
      const dy = e.clientY - pointer.lastRawY;
      pointer.lastRawX = e.clientX;
      pointer.lastRawY = e.clientY;
      pointer.targetX = e.clientX;
      pointer.targetY = e.clientY;
      pointer.active = true;

      const speed = Math.hypot(dx, dy);
      pointer.vx = pointer.vx * 0.6 + dx * 0.4;
      pointer.vy = pointer.vy * 0.6 + dy * 0.4;
      pointer.shakeEnergy = Math.min(1.6, pointer.shakeEnergy + speed * 0.015);
    };

    const onTouchMove = (e: TouchEvent) => {
      const touch = e.touches[0];
      if (!touch) return;
      const dx = touch.clientX - pointer.lastRawX;
      const dy = touch.clientY - pointer.lastRawY;
      pointer.lastRawX = touch.clientX;
      pointer.lastRawY = touch.clientY;
      pointer.targetX = touch.clientX;
      pointer.targetY = touch.clientY;
      pointer.active = true;
      const speed = Math.hypot(dx, dy);
      pointer.vx = pointer.vx * 0.6 + dx * 0.4;
      pointer.vy = pointer.vy * 0.6 + dy * 0.4;
      pointer.shakeEnergy = Math.min(1.4, pointer.shakeEnergy + speed * 0.013);
    };

    const onPointerLeave = () => {
      pointer.active = false;
    };

    const onMotionChange = (ev: MediaQueryListEvent) => {
      prefersReduced = ev.matches;
    };

    window.addEventListener('resize', resize, { passive: true });
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerleave', onPointerLeave, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    reducedMotionQuery.addEventListener('change', onMotionChange);

    let rafId = 0;
    const startTime = performance.now();

    const renderFrame = (now: number) => {
      rafId = window.requestAnimationFrame(renderFrame);
      if (document.hidden) return;

      const t = (now - startTime) * 0.001;
      const isDark = theme === 'dark';

      pointer.x += (pointer.targetX - pointer.x) * 0.16;
      pointer.y += (pointer.targetY - pointer.y) * 0.16;
      pointer.vx *= 0.87;
      pointer.vy *= 0.87;
      pointer.shakeEnergy *= 0.91;

      ctx.clearRect(0, 0, width, height);

      const influenceRadius = Math.min(240, Math.max(150, width * 0.16));
      const baseAlpha = isDark ? 0.48 : 0.42;

      for (let i = 0; i < dots.length; i++) {
        const d = dots[i];
        const driftScale = prefersReduced ? 0.15 : 1;
        const homeX =
          d.anchorU * width +
          Math.sin(t * d.driftSpeed + d.phase) * d.driftAmp * driftScale;
        const homeY =
          d.anchorV * height +
          Math.cos(t * d.driftSpeed * 0.88 + d.phase) * d.driftAmp * driftScale;

        let proximity = 0;
        if (!prefersReduced && pointer.active) {
          const dx = d.x - pointer.x;
          const dy = d.y - pointer.y;
          const dist = Math.hypot(dx, dy);

          if (dist < influenceRadius && dist > 0.001) {
            proximity = 1 - dist / influenceRadius;
            const easeProx = proximity * proximity;
            // Gentle radial repulsion + cursor velocity drag + micro-shake ripple
            const push = easeProx * (1.25 + pointer.shakeEnergy * 1.9);
            const swirlShake =
              Math.sin(t * 26 + d.phase) * pointer.shakeEnergy * easeProx * 1.35;

            d.vx +=
              (dx / dist) * push +
              pointer.vx * 0.048 * easeProx -
              (dy / dist) * swirlShake * 0.45;
            d.vy +=
              (dy / dist) * push +
              pointer.vy * 0.048 * easeProx +
              (dx / dist) * swirlShake * 0.45;
          }
        }

        // Elastic spring back toward anchor
        d.vx += (homeX - d.x) * 0.045;
        d.vy += (homeY - d.y) * 0.045;
        d.vx *= 0.86;
        d.vy *= 0.86;
        d.x += d.vx;
        d.y += d.vy;

        const rgb =
          d.tone === 'red'
            ? isDark
              ? RED_DARK_PALETTE[d.shadeIdx]
              : RED_LIGHT_PALETTE[d.shadeIdx]
            : isDark
            ? YELLOW_DARK_PALETTE[d.shadeIdx]
            : YELLOW_LIGHT_PALETTE[d.shadeIdx];

        const twinkle =
          Math.sin(t * (1.4 + d.driftSpeed) + d.phase) * 0.09 + 0.04;
        const alpha = Math.min(
          0.92,
          Math.max(0.22, baseAlpha + twinkle + proximity * 0.36)
        );
        const drawRadius =
          d.radius * (1 + proximity * (0.42 + pointer.shakeEnergy * 0.2));

        ctx.beginPath();
        ctx.arc(d.x, d.y, drawRadius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${rgb}, ${alpha.toFixed(3)})`;
        ctx.fill();
      }
    };

    rafId = window.requestAnimationFrame(renderFrame);

    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerleave', onPointerLeave);
      window.removeEventListener('touchmove', onTouchMove);
      reducedMotionQuery.removeEventListener('change', onMotionChange);
    };
  }, [theme]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-0 h-full w-full"
    />
  );
};
