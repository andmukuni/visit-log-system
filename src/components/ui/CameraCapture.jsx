import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, RotateCcw, X } from 'lucide-react';
import LoadingButton from './LoadingButton';

function stopStream(stream) {
  stream?.getTracks?.().forEach((track) => track.stop());
}

export default function CameraCapture({
  label,
  hint = 'Tap to open camera',
  preview,
  onCapture,
  onError,
  facingMode = 'environment',
  className = '',
}) {
  const [open, setOpen] = useState(false);
  const [starting, setStarting] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  const closeCamera = useCallback(() => {
    stopStream(streamRef.current);
    streamRef.current = null;
    setOpen(false);
    setStarting(false);
    setCameraError('');
  }, []);

  const startCamera = useCallback(async () => {
    setStarting(true);
    setCameraError('');
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Camera is not supported on this device.');
      }

      stopStream(streamRef.current);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      streamRef.current = stream;
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        await video.play();
      }
    } catch (err) {
      const message = err?.message || 'Could not access the camera.';
      setCameraError(message);
      onErrorRef.current?.(message);
    } finally {
      setStarting(false);
    }
  }, [facingMode]);

  useEffect(() => {
    if (!open) return undefined;
    void startCamera();
    return () => {
      stopStream(streamRef.current);
      streamRef.current = null;
    };
  }, [open, startCamera]);

  const handleCapture = () => {
    const video = videoRef.current;
    if (!video?.videoWidth) return;

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    onCapture?.(canvas.toDataURL('image/jpeg', 0.88));
    closeCamera();
  };

  const openCamera = () => {
    setOpen(true);
  };

  return (
    <>
      <button
        type="button"
        onClick={openCamera}
        className={`flex w-full min-h-24 items-center gap-4 rounded-2xl border border-dashed border-navy-200 bg-navy-50/70 px-4 py-3 text-left transition-colors hover:border-cyan-300 hover:bg-cyan-50/40 ${className}`}
      >
        {preview ? (
          <img src={preview} alt="" className="h-16 w-16 shrink-0 rounded-xl object-cover ring-2 ring-white" />
        ) : (
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-navy-200 bg-white text-cyan-600 shadow-sm">
            <Camera size={24} aria-hidden="true" />
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-navy-900">{label}</span>
          <span className="block text-xs text-navy-500">{preview ? 'Tap to retake photo' : hint}</span>
        </span>
      </button>

      {open ? (
        <div className="fixed inset-0 z-[100] flex flex-col bg-navy-950">
          <div className="flex items-center justify-between border-b border-navy-800 px-4 py-3 sm:px-6">
            <button
              type="button"
              onClick={closeCamera}
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-navy-700 bg-navy-900 text-white transition-colors hover:bg-navy-800"
              aria-label="Close camera"
            >
              <X size={20} aria-hidden="true" />
            </button>
            <p className="text-sm font-semibold text-white">{label}</p>
            <div className="h-10 w-10" aria-hidden="true" />
          </div>

          <div className="relative flex min-h-0 flex-1 items-center justify-center bg-black">
            {starting ? (
              <p className="text-sm text-navy-200">Starting camera…</p>
            ) : null}
            {cameraError ? (
              <div className="max-w-sm px-6 text-center">
                <p className="text-sm font-medium text-red-300">{cameraError}</p>
                <LoadingButton
                  type="button"
                  variant="secondary"
                  className="mt-4"
                  onClick={() => void startCamera()}
                >
                  Try again
                </LoadingButton>
              </div>
            ) : (
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="h-full w-full object-cover"
              />
            )}
          </div>

          <div className="gate-entry-actions flex items-center justify-center gap-4 border-t border-navy-800 bg-navy-950 px-4 py-5 sm:px-6">
            <button
              type="button"
              onClick={closeCamera}
              className="inline-flex h-12 min-w-[7rem] items-center justify-center rounded-xl border border-navy-700 bg-navy-900 px-4 text-sm font-semibold text-white transition-colors hover:bg-navy-800"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleCapture}
              disabled={Boolean(cameraError) || starting}
              className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-white text-navy-900 shadow-lg ring-4 ring-cyan-500/40 transition-transform hover:scale-105 disabled:opacity-50"
              aria-label="Capture photo"
            >
              <Camera size={24} aria-hidden="true" />
            </button>
            {preview ? (
              <button
                type="button"
                onClick={() => onCapture?.('')}
                className="inline-flex h-12 min-w-[7rem] items-center justify-center gap-2 rounded-xl border border-navy-700 bg-navy-900 px-4 text-sm font-semibold text-white transition-colors hover:bg-navy-800"
              >
                <RotateCcw size={16} aria-hidden="true" />
                Clear
              </button>
            ) : (
              <div className="min-w-[7rem]" aria-hidden="true" />
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
