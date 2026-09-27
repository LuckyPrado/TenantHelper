'use client';

import { useEffect, useRef, useState } from 'react';

type State = 'idle' | 'loading' | 'playing' | 'error';

/**
 * Plays the narrated summary.
 *
 * Audio is fetched only on click — narration costs ElevenLabs credits, so a
 * page view that nobody listens to must not spend any. The server route caches
 * for 24h, so a second listen is free.
 */
export function ListenButton({ bbl }: { readonly bbl: string }) {
  const [state, setState] = useState<State>('idle');
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Stop playback if the reader navigates away mid-sentence.
  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      audioRef.current = null;
    };
  }, []);

  async function play() {
    if (state === 'playing') {
      audioRef.current?.pause();
      setState('idle');
      return;
    }

    setState('loading');
    // No query string: it would make the route dynamic and defeat its cache.
    const url = `/api/speech/${bbl}`;

    try {
      const response = await fetch(url);
      if (!response.ok) {
        setState('error');
        return;
      }
      const blob = await response.blob();
      const audio = new Audio(URL.createObjectURL(blob));
      audioRef.current = audio;
      audio.onended = () => setState('idle');
      audio.onerror = () => setState('error');
      await audio.play();
      setState('playing');
    } catch {
      setState('error');
    }
  }

  const label = {
    idle: 'Listen',
    loading: 'Loading…',
    playing: 'Stop',
    error: 'Unavailable',
  }[state];

  return (
    <button
      type="button"
      onClick={play}
      disabled={state === 'loading' || state === 'error'}
      aria-label={state === 'playing' ? 'Stop narration' : 'Listen to this summary'}
      className="inline-flex items-center gap-1.5 border border-ink px-2 py-0.5 text-[0.72rem] font-600 text-ink transition-colors hover:bg-ink hover:text-paper disabled:border-paper-edge disabled:text-ink-faint disabled:hover:bg-transparent"
    >
      <span aria-hidden>{state === 'playing' ? '◼' : '▶'}</span>
      {label}
    </button>
  );
}
