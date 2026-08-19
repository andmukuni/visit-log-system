import { useCallback, useEffect, useRef } from 'react';
import { Eraser } from 'lucide-react';
import Button from './Button';

function getCssPoint(canvas, event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  };
}

function applyStrokeStyle(ctx) {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = '#0f172a';
}

export default function SignaturePad({
  value = '',
  onChange,
  label = 'Sign here',
  hint = 'Use your finger or stylus to sign',
  className = '',
  minHeight = 200,
  maxHeight = 280,
  aspect = 0.35,
  showGuide = false,
  paper = false,
}) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const drawingRef = useRef(false);
  const hasStrokesRef = useRef(false);
  const lastPointRef = useRef(null);
  const dprRef = useRef(window.devicePixelRatio || 1);

  const setupContext = useCallback((canvas) => {
    const ctx = canvas.getContext('2d');
    const dpr = dprRef.current;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    applyStrokeStyle(ctx);
    return ctx;
  }, []);

  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const dpr = window.devicePixelRatio || 1;
    dprRef.current = dpr;

    const width = container.clientWidth;
    const height = Math.max(minHeight, Math.min(maxHeight, Math.round(width * aspect)));
    const snapshot = hasStrokesRef.current ? canvas.toDataURL('image/png') : '';

    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const ctx = setupContext(canvas);
    ctx.clearRect(0, 0, width, height);

    if (snapshot) {
      const image = new Image();
      image.onload = () => {
        ctx.drawImage(image, 0, 0, width, height);
      };
      image.src = snapshot;
    }
  }, [setupContext, minHeight, maxHeight, aspect]);

  useEffect(() => {
    resizeCanvas();
    const container = containerRef.current;
    if (!container) return undefined;

    const observer = new ResizeObserver(() => {
      resizeCanvas();
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [resizeCanvas]);

  useEffect(() => {
    if (value) {
      hasStrokesRef.current = true;
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;

    hasStrokesRef.current = false;
    const ctx = setupContext(canvas);
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    ctx.clearRect(0, 0, width, height);
  }, [value, setupContext]);

  const startDraw = (event) => {
    event.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    drawingRef.current = true;
    lastPointRef.current = getCssPoint(canvas, event);
    canvas.setPointerCapture?.(event.pointerId);
  };

  const draw = (event) => {
    if (!drawingRef.current) return;
    event.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const point = getCssPoint(canvas, event);
    const last = lastPointRef.current || point;

    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();

    lastPointRef.current = point;
    hasStrokesRef.current = true;
  };

  const endDraw = (event) => {
    if (!drawingRef.current) return;
    event.preventDefault();
    drawingRef.current = false;
    lastPointRef.current = null;
    canvasRef.current?.releasePointerCapture?.(event.pointerId);

    const canvas = canvasRef.current;
    if (!canvas || !hasStrokesRef.current) {
      onChange?.('');
      return;
    }
    onChange?.(canvas.toDataURL('image/png'));
  };

  const clear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    hasStrokesRef.current = false;
    const ctx = setupContext(canvas);
    ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
    onChange?.('');
  };

  return (
    <div className={className}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-navy-800">{label}</p>
          <p className="mt-0.5 text-xs text-navy-400">{hint}</p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          icon={Eraser}
          onClick={clear}
          className="shrink-0 text-navy-600"
        >
          Clear
        </Button>
      </div>
      <div
        ref={containerRef}
        className={`relative overflow-hidden rounded-2xl border-2 border-dashed border-navy-200 shadow-inner ${paper ? 'bg-[#fbfaf6]' : 'bg-white'}`}
      >
        <canvas
          ref={canvasRef}
          className={`block w-full touch-none cursor-crosshair ${paper ? 'bg-transparent' : 'bg-white'}`}
          aria-label={label}
          onPointerDown={startDraw}
          onPointerMove={draw}
          onPointerUp={endDraw}
          onPointerLeave={endDraw}
          onPointerCancel={endDraw}
        />
        {showGuide ? (
          <div className="pointer-events-none absolute inset-x-8 bottom-8">
            <div className="border-b border-navy-300/70" />
            <p className="mt-1.5 text-[11px] tracking-wide text-navy-300">Sign above the line</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
