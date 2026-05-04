import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Video, VideoOff, Loader2 } from 'lucide-react';

/**
 * Local-only self video (not streamed to peers). Mirror preview similar to Zoom self-view.
 * @param {boolean} [compact] — Small thumbnail: no title bar, for ribbon / toolbar placement.
 */
export default function SelfCameraPreview({ active, className = '', compact = false, style }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [status, setStatus] = useState('off');
  const [userOff, setUserOff] = useState(false);
  const [retryNonce, setRetryNonce] = useState(0);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setStatus('off');
  }, []);

  useEffect(() => {
    if (!active) {
      setUserOff(false);
      stop();
    }
  }, [active, stop]);

  useEffect(() => {
    if (!active || userOff) {
      if (active && userOff) stop();
      return undefined;
    }
    if (streamRef.current) return undefined;

    let cancelled = false;
    setStatus('loading');
    (async () => {
      try {
        const s = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'user',
            width: { ideal: 640 },
            height: { ideal: 360 },
          },
          audio: false,
        });
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = s;
        const el = videoRef.current;
        if (el) {
          el.srcObject = s;
          void el.play().catch(() => {});
        }
        setStatus('live');
      } catch {
        if (!cancelled) setStatus('denied');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [active, userOff, stop, retryNonce]);

  const showVideo = status === 'live' && streamRef.current;

  const shell =
    compact ?
      `pointer-events-auto flex h-full min-h-[4.75rem] min-w-[7.25rem] shrink-0 flex-col overflow-hidden rounded-lg border-2 border-emerald-500/55 bg-zinc-950 shadow-lg ring-1 ring-black/50 ${className}`
    : `pointer-events-auto flex flex-col overflow-hidden rounded-xl border border-emerald-500/35 bg-zinc-900 shadow-2xl ${className}`;

  const videoShell =
    compact ? 'relative min-h-[4rem] flex-1 w-full bg-black' : 'relative aspect-video w-full bg-zinc-950';

  return (
    <div className={shell} style={style} role="region" aria-label="Your camera preview">
      {!compact && (
        <div className="flex shrink-0 items-center gap-2 border-b border-white/10 bg-zinc-900/95 px-2.5 py-1.5">
          <Video className="h-3.5 w-3.5 shrink-0 text-emerald-400" aria-hidden />
          <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-200">
            Your camera
          </span>
          <span className="ml-auto truncate text-[9px] font-normal normal-case text-zinc-500">
            Only you see this
          </span>
        </div>
      )}
      <div className={videoShell}>
        <video
          ref={videoRef}
          className={`absolute inset-0 h-full w-full object-cover [transform:scaleX(-1)] ${showVideo ? 'opacity-100' : 'opacity-0'}`}
          playsInline
          muted
          autoPlay
        />
        {status === 'loading' && (
          <div
            className={`absolute inset-0 flex flex-col items-center justify-center gap-1 bg-zinc-950 text-zinc-400 ${compact ? 'p-1' : 'gap-2'}`}
          >
            <Loader2 className={`animate-spin text-indigo-400 ${compact ? 'h-6 w-6' : 'h-8 w-8'}`} />
            {!compact && <span className="text-xs">Starting camera…</span>}
          </div>
        )}
        {status === 'denied' && (
          <div
            className={`absolute inset-0 flex flex-col items-center justify-center bg-zinc-950 px-1 text-center text-zinc-400 ${compact ? 'gap-0.5 py-1' : 'gap-2 px-2'}`}
          >
            <VideoOff className={`text-zinc-500 ${compact ? 'h-5 w-5' : 'h-8 w-8'}`} />
            {!compact && (
              <span className="text-xs leading-snug">Camera unavailable or blocked</span>
            )}
            {compact && <span className="text-[9px] leading-tight">No camera</span>}
            <button
              type="button"
              onClick={() => {
                stop();
                setRetryNonce((n) => n + 1);
              }}
              className="mt-0.5 rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-zinc-200 hover:bg-white/15"
            >
              Retry
            </button>
          </div>
        )}
        {status === 'off' && active && userOff && (
          <div
            className={`absolute inset-0 flex flex-col items-center justify-center bg-zinc-950 text-zinc-500 ${compact ? 'gap-0.5' : 'gap-2'}`}
          >
            <VideoOff className={compact ? 'h-5 w-5' : 'h-8 w-8'} />
            {!compact && <span className="text-xs">Camera off</span>}
          </div>
        )}
        <div
          className={`pointer-events-none absolute rounded bg-black/65 font-semibold uppercase tracking-wide text-white/95 ${compact ? 'bottom-1 left-1 px-1.5 py-0.5 text-[8px]' : 'left-2 top-2 px-2 py-0.5 text-[10px]'}`}
        >
          {compact ? 'You' : 'Preview'}
        </div>
        {status === 'live' && (
          <button
            type="button"
            onClick={() => setUserOff(true)}
            className={`absolute flex items-center justify-center rounded-full border border-white/25 bg-black/65 text-white shadow backdrop-blur-sm transition hover:bg-black/85 ${compact ? 'bottom-1 right-1 h-6 w-6' : 'bottom-2 right-2 h-9 w-9'}`}
            title="Turn camera off"
            aria-label="Turn camera off"
          >
            <VideoOff className={compact ? 'h-3 w-3' : 'h-4 w-4'} />
          </button>
        )}
        {(status === 'off' || status === 'denied') && active && userOff && (
          <button
            type="button"
            onClick={() => setUserOff(false)}
            className={`absolute flex items-center justify-center rounded-full border border-emerald-500/40 bg-emerald-950/90 text-emerald-100 shadow backdrop-blur-sm transition hover:bg-emerald-900 ${compact ? 'bottom-1 right-1 h-6 w-6' : 'bottom-2 right-2 h-9 w-9'}`}
            title="Turn camera on"
            aria-label="Turn camera on"
          >
            <Video className={compact ? 'h-3 w-3' : 'h-4 w-4'} />
          </button>
        )}
      </div>
    </div>
  );
}
