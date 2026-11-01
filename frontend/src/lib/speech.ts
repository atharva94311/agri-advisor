import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api";

/* Voice goes through the server's speech APIs (Sarvam AI) for every Indian language: the mic records raw audio
   for POST /voice (speech-to-text), and replies are spoken with POST /tts (text-to-speech). The browser's
   built-in speech engines are not used, since they lack most Indian-language voices. */

export const canRecord = () => typeof window !== "undefined" && "MediaRecorder" in window && !!navigator.mediaDevices?.getUserMedia;

/** One push-to-talk session: start() begins recording, stop() ends it and hands the audio to onDone. */
export function useListener(onDone: (audio: Blob) => void) {
  const [listening, setListening] = useState(false);
  const [level, setLevel] = useState(0);
  const mediaRef = useRef<{ rec: MediaRecorder; stream: MediaStream; ctx: AudioContext; raf: number } | null>(null);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  const cleanupMedia = () => {
    const m = mediaRef.current;
    if (!m) return;
    cancelAnimationFrame(m.raf);
    m.stream.getTracks().forEach((t) => t.stop());
    m.ctx.close().catch(() => {});
    mediaRef.current = null;
  };

  const start = useCallback(async () => {
    if (!canRecord()) throw new Error("This browser can't capture audio.");
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const rec = new MediaRecorder(stream);
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.onstop = () => {
      cleanupMedia();
      setListening(false);
      setLevel(0);
      if (chunks.length) doneRef.current(new Blob(chunks, { type: rec.mimeType || "audio/webm" }));
    };
    const ctx = new AudioContext();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    ctx.createMediaStreamSource(stream).connect(analyser);
    const buf = new Uint8Array(analyser.frequencyBinCount);
    const tick = () => {
      analyser.getByteFrequencyData(buf);
      setLevel(buf.reduce((s, v) => s + v, 0) / buf.length / 128);
      if (mediaRef.current) mediaRef.current.raf = requestAnimationFrame(tick);
    };
    mediaRef.current = { rec, stream, ctx, raf: requestAnimationFrame(tick) };
    rec.start();
    setListening(true);
  }, []);

  const stop = useCallback(() => {
    const m = mediaRef.current;
    if (m && m.rec.state !== "inactive") m.rec.stop();
  }, []);

  const cancel = useCallback(() => {
    const m = mediaRef.current;
    if (m) {
      m.rec.onstop = null;
      if (m.rec.state !== "inactive") m.rec.stop();
      cleanupMedia();
    }
    setListening(false);
    setLevel(0);
  }, []);

  useEffect(() => cancel, [cancel]);

  return { listening, level, start, stop, cancel };
}

// Text-to-speech

export function useSpeaker() {
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const requestRef = useRef(0);

  const stop = useCallback(() => {
    requestRef.current++; // drop any speech request still in flight
    audioRef.current?.pause();
    audioRef.current = null;
    setSpeakingId(null);
    setLoadingId(null);
  }, []);

  const playAudio = useCallback(
    (id: string, base64: string, mime: string) => {
      stop();
      const a = new Audio(`data:${mime};base64,${base64}`);
      a.onended = () => setSpeakingId((s) => (s === id ? null : s));
      audioRef.current = a;
      setSpeakingId(id);
      a.play().catch(() => setSpeakingId(null));
    },
    [stop],
  );

  /** Fetch speech for `text` from the server (Sarvam TTS) and play it. */
  const speak = useCallback(
    async (id: string, text: string, language: string) => {
      stop();
      const ticket = ++requestRef.current;
      setLoadingId(id);
      try {
        const r = await api.tts(text, language);
        if (ticket !== requestRef.current) return;
        setLoadingId(null);
        playAudio(id, r.audio_base64, r.mime_type);
      } catch (err) {
        if (ticket === requestRef.current) setLoadingId(null);
        throw err;
      }
    },
    [stop, playAudio],
  );

  useEffect(() => stop, [stop]);
  return { speakingId, loadingId, speak, playAudio, stop };
}
