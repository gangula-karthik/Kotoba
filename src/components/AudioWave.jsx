import React, { useEffect, useRef } from "react";

const BAR_COUNT = 32;
const SMOOTHING = 0.6;

const AudioWave = ({ isRecording = false, isSpeaking = true, isSpeakingRef, stream = null, audioContext = null }) => {
  const containerRef = useRef(null);
  const analyserRef = useRef(null);
  const dataArrayRef = useRef(null);
  const animationRef = useRef(null);
  const prevHeightsRef = useRef(new Float32Array(BAR_COUNT).fill(3));
  const sourceRef = useRef(null);
  const gainRef = useRef(null);

  // Fallback: if no ref passed, use prop value via local ref
  const localRef = useRef(isSpeaking);
  localRef.current = isSpeaking;
  const speakingRef = isSpeakingRef || localRef;

  useEffect(() => {
    if (!isRecording || !stream || !audioContext) {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
      prevHeightsRef.current.fill(3);
      return;
    }

    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.75;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    analyserRef.current = analyser;
    dataArrayRef.current = dataArray;

    // Connect: source → analyser → silent gain → destination
    // The destination connection ensures Chromium actually processes the audio graph
    const source = audioContext.createMediaStreamSource(stream);
    const gain = audioContext.createGain();
    gain.gain.value = 0; // silent — no speaker output
    source.connect(analyser);
    analyser.connect(gain);
    gain.connect(audioContext.destination);

    sourceRef.current = source;
    gainRef.current = gain;

    const updateWave = () => {
      if (!analyserRef.current || !dataArrayRef.current || !containerRef.current)
        return;

      analyserRef.current.getByteFrequencyData(dataArrayRef.current);

      const bars = containerRef.current.children;
      const half = Math.ceil(BAR_COUNT / 2);
      const step = Math.floor(bufferLength / half);

      for (let i = 0; i < half; i++) {
        const value = speakingRef.current ? (dataArrayRef.current[i * step] || 0) : 0;
        const targetHeight = Math.max(3, (value / 255) * 28);

        const leftIdx = half - 1 - i;
        const prevLeft = prevHeightsRef.current[leftIdx];
        const smoothedLeft = prevLeft * SMOOTHING + targetHeight * (1 - SMOOTHING);
        prevHeightsRef.current[leftIdx] = smoothedLeft;
        if (bars[leftIdx]) bars[leftIdx].style.height = `${smoothedLeft}px`;

        const rightIdx = half + i;
        if (rightIdx < BAR_COUNT) {
          prevHeightsRef.current[rightIdx] = smoothedLeft;
          if (bars[rightIdx]) bars[rightIdx].style.height = `${smoothedLeft}px`;
        }
      }

      animationRef.current = requestAnimationFrame(updateWave);
    };

    updateWave();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      source.disconnect();
      analyser.disconnect();
      gain.disconnect();
      sourceRef.current = null;
      gainRef.current = null;
    };
  }, [isRecording, stream, audioContext]);

  return (
    <div
      ref={containerRef}
      className="flex w-full items-center justify-center gap-[2px]"
      style={{ height: "100%", opacity: isSpeaking ? 1 : 0.35, transition: "opacity 150ms ease" }}
    >
      {Array.from({ length: BAR_COUNT }, (_, i) => (
        <div
          key={i}
          className="flex-1 max-w-[3px] rounded-full bg-foreground/40"
          style={{ height: "3px", transition: "height 80ms ease-out" }}
        />
      ))}
    </div>
  );
};

export default AudioWave;
