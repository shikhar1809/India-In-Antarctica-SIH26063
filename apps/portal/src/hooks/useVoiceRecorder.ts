import { useRef, useState } from 'react';

/** Tap-to-record, tap-to-stop microphone capture. Kept as a hook so the
 *  Send tab stays declarative — it just reads `recording`/`blob`/`seconds`. */
export function useVoiceRecorder() {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const timer = useRef<number | null>(null);

  const start = async () => {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("This browser can't record audio — try attaching a photo instead.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunks.current = [];
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunks.current.push(e.data); };
      rec.onstop = () => {
        setBlob(new Blob(chunks.current, { type: rec.mimeType || 'audio/webm' }));
        stream.getTracks().forEach((t) => t.stop());
      };
      rec.start();
      mediaRecorder.current = rec;
      setSeconds(0);
      setRecording(true);
      timer.current = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch {
      setError('Microphone access was denied — allow it in your browser to record a voice note.');
    }
  };

  const stop = () => {
    mediaRecorder.current?.stop();
    setRecording(false);
    if (timer.current) window.clearInterval(timer.current);
  };

  const reset = () => {
    setBlob(null);
    setSeconds(0);
    setError(null);
  };

  return { recording, seconds, blob, error, start, stop, reset };
}
