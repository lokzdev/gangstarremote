import { useEffect, useRef } from 'react';

interface LatencyBadgeProps {
  lastActivityAt?: string;
  isOnline: boolean;
}

function formatLatency(ms: number): { text: string; className: string } {
  if (ms < 120) {
    return {
      text: `⚡ ${ms}ms`,
      className: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
    };
  }
  if (ms <= 500) {
    return {
      text: `⚠ ${ms}ms`,
      className: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
    };
  }
  return {
    text: `⚠ ${ms}ms`,
    className: 'text-orange-400 bg-orange-500/10 border-orange-500/30',
  };
}

export default function LatencyBadge({ lastActivityAt, isOnline }: LatencyBadgeProps) {
  const spanRef = useRef<HTMLSpanElement>(null);
  const lastActivityRef = useRef(lastActivityAt);
  const isOnlineRef = useRef(isOnline);

  lastActivityRef.current = lastActivityAt;
  isOnlineRef.current = isOnline;

  useEffect(() => {
    const update = () => {
      const el = spanRef.current;
      if (!el) return;

      if (!isOnlineRef.current || !lastActivityRef.current) {
        el.textContent = '—';
        el.className =
          'font-mono text-[10px] px-1.5 py-0.5 rounded border border-slate-700/50 text-slate-500 bg-slate-800/40';
        return;
      }

      const ts = new Date(lastActivityRef.current).getTime();
      if (Number.isNaN(ts)) {
        el.textContent = '—';
        return;
      }

      const ms = Math.max(0, Date.now() - ts);
      const { text, className } = formatLatency(ms);
      el.textContent = text;
      el.className = `font-mono text-[10px] px-1.5 py-0.5 rounded border ${className}`;
    };

    update();
    const id = window.setInterval(update, 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const el = spanRef.current;
    if (!el) return;

    if (!isOnline || !lastActivityAt) {
      el.textContent = '—';
      el.className =
        'font-mono text-[10px] px-1.5 py-0.5 rounded border border-slate-700/50 text-slate-500 bg-slate-800/40';
      return;
    }

    const ts = new Date(lastActivityAt).getTime();
    if (Number.isNaN(ts)) return;

    const ms = Math.max(0, Date.now() - ts);
    const { text, className } = formatLatency(ms);
    el.textContent = text;
    el.className = `font-mono text-[10px] px-1.5 py-0.5 rounded border ${className}`;
  }, [isOnline, lastActivityAt]);

  if (!isOnline) {
    return (
      <span className="font-mono text-[10px] px-1.5 py-0.5 rounded border border-slate-700/50 text-slate-500 bg-slate-800/40">
        —
      </span>
    );
  }

  return (
    <span
      ref={spanRef}
      className="font-mono text-[10px] px-1.5 py-0.5 rounded border border-slate-700/50 text-slate-400 bg-slate-800/40"
    />
  );
}
