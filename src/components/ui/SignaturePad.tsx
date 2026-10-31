'use client';

import { useEffect, useRef, useState } from 'react';
import { Eraser } from 'lucide-react';

type Props = {
  /** Image PNG (data URL) de la signature, ou null si le cadre est vide */
  onChange: (signature: string | null) => void;
  disabled?: boolean;
};

// Résolution interne fixe : l'image reste légère quelle que soit la taille d'écran
const WIDTH = 600;
const HEIGHT = 200;

/** Cadre de signature manuscrite (souris, doigt ou stylet). */
export default function SignaturePad({ onChange, disabled = false }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [empty, setEmpty] = useState(true);

  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    ctx.lineWidth = 2.6;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#0f2854';
  }, []);

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * WIDTH,
      y: ((e.clientY - rect.top) / rect.height) * HEIGHT,
    };
  };

  const start = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    last.current = point(e);
    // Un simple clic laisse un point
    const ctx = e.currentTarget.getContext('2d');
    if (ctx) {
      ctx.beginPath();
      ctx.arc(last.current.x, last.current.y, 1.3, 0, Math.PI * 2);
      ctx.fillStyle = '#0f2854';
      ctx.fill();
    }
  };

  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current || !last.current) return;
    const ctx = e.currentTarget.getContext('2d');
    if (!ctx) return;
    const p = point(e);
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
  };

  const end = () => {
    if (!drawing.current) return;
    drawing.current = false;
    last.current = null;
    setEmpty(false);
    onChange(canvasRef.current?.toDataURL('image/png') ?? null);
  };

  const clear = () => {
    const canvas = canvasRef.current;
    canvas?.getContext('2d')?.clearRect(0, 0, WIDTH, HEIGHT);
    setEmpty(true);
    onChange(null);
  };

  return (
    <div>
      <div style={{ position: 'relative', border: '1.5px dashed var(--neutral-300)', borderRadius: 10, background: '#fff', overflow: 'hidden' }}>
        <canvas
          ref={canvasRef}
          width={WIDTH}
          height={HEIGHT}
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerCancel={end}
          aria-label="Zone de signature"
          style={{ display: 'block', width: '100%', aspectRatio: `${WIDTH} / ${HEIGHT}`, touchAction: 'none', cursor: disabled ? 'not-allowed' : 'crosshair' }}
        />
        {empty && (
          <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: 13, pointerEvents: 'none' }}>
            Signez ici avec la souris, le doigt ou un stylet
          </span>
        )}
        <div style={{ position: 'absolute', left: '8%', right: '8%', bottom: '22%', borderBottom: '1px solid #e2e8f0', pointerEvents: 'none' }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
        <button type="button" className="btn btn-ghost btn-sm" onClick={clear} disabled={disabled || empty}>
          <Eraser size={14} /> Effacer
        </button>
      </div>
    </div>
  );
}
