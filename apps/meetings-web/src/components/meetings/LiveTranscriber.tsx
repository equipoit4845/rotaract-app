'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAuthState } from '@/context/AuthContext';
import { topicsApi, queueApi } from '@/lib/api';
import { toast } from 'sonner';

interface LiveTranscriberProps {
  meetingId: string;
  currentSpeakerId: string | null | undefined;
  currentTopicId: string | null | undefined;
  transcriptionEnabled?: boolean;
  /** Si la mesa toma la voz en nombre de un invitado, su nombre para atribuir la transcripción. */
  onBehalfOf?: string | null;
}

function MicIcon({ size = 32 }: { size?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="white"
    >
      <path d="M12 1a4 4 0 0 1 4 4v6a4 4 0 0 1-8 0V5a4 4 0 0 1 4-4zm-1.5 15.93A8.001 8.001 0 0 1 4 11H2a10 10 0 0 0 9 9.95V23h2v-2.05A10 10 0 0 0 22 11h-2a8 8 0 0 1-7.5 5.93z" />
    </svg>
  );
}

function MicrophoneModal({ onActivate }: { onActivate: () => void }) {
  return createPortal(
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.65)',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
        animation: 'ltFadeIn 0.2s ease',
      }}
    >
      <style>{`
        @keyframes ltFadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes ltSlideUp { from { opacity: 0; transform: translateY(24px) scale(0.97); } to { opacity: 1; transform: translateY(0) scale(1); } }
        #lt-activate-btn:hover { background: #1d4ed8 !important; }
        #lt-activate-btn:active { transform: scale(0.97); }
      `}</style>
      <div
        style={{
          background: '#ffffff',
          borderRadius: '20px',
          padding: '40px 36px',
          maxWidth: '440px',
          width: '90%',
          boxShadow: '0 24px 60px rgba(0,0,0,0.25)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '20px',
          animation: 'ltSlideUp 0.25s ease',
          textAlign: 'center',
        }}
      >
        {/* Mic icon */}
        <div
          style={{
            width: '72px',
            height: '72px',
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 8px 24px rgba(37,99,235,0.35)',
            flexShrink: 0,
          }}
        >
          <MicIcon size={32} />
        </div>

        {/* Title */}
        <div>
          <p
            style={{
              margin: '0 0 4px 0',
              fontSize: '11px',
              fontWeight: 600,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: '#2563eb',
            }}
          >
            Es tu turno de hablar
          </p>
          <h2
            style={{
              margin: 0,
              fontSize: '22px',
              fontWeight: 700,
              color: '#0f172a',
              lineHeight: 1.3,
            }}
          >
            Activar micrófono
          </h2>
        </div>

        {/* Body */}
        <p
          style={{
            margin: 0,
            fontSize: '15px',
            color: '#475569',
            lineHeight: 1.65,
          }}
        >
          Tu micrófono será usado para la transcripción del acta{' '}
          <strong style={{ color: '#0f172a', fontWeight: 600 }}>
            solo cuando se habilite la palabra.
          </strong>
        </p>

        {/* CTA */}
        <button
          id="lt-activate-btn"
          onClick={onActivate}
          style={{
            marginTop: '4px',
            padding: '14px 32px',
            fontSize: '15px',
            fontWeight: 600,
            color: '#ffffff',
            background: '#2563eb',
            border: 'none',
            borderRadius: '12px',
            cursor: 'pointer',
            width: '100%',
            transition: 'background 0.15s ease, transform 0.1s ease',
            boxShadow: '0 4px 14px rgba(37,99,235,0.4)',
          }}
        >
          🎙️ Activar micrófono
        </button>
      </div>
    </div>,
    document.body,
  );
}

type FabState = 'recording' | 'confirming' | 'releasing';

/**
 * Botón flotante persistente mientras el usuario tiene la palabra.
 * Permite al orador terminar su propia intervención (soltar la palabra)
 * con confirmación en dos toques. No permite volver a tomarla: eso
 * solo puede hacerlo el secretario/RDR.
 */
function MicFloatingButton({
  state,
  onTap,
  onBehalfOf,
}: {
  state: FabState;
  onTap: () => void;
  onBehalfOf?: string | null;
}) {
  const visuals: Record<FabState, { bg: string; shadow: string; title: string; subtitle: string }> = {
    recording: {
      bg: 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)',
      shadow: '0 8px 24px rgba(220,38,38,0.35)',
      title: onBehalfOf ? `Transcribiendo en nombre de ${onBehalfOf}` : 'Transcribiendo tu voz',
      subtitle: 'Tocá para terminar tu intervención',
    },
    confirming: {
      bg: 'linear-gradient(135deg, #d97706 0%, #b45309 100%)',
      shadow: '0 8px 24px rgba(217,119,6,0.4)',
      title: '¿Terminar tu intervención?',
      subtitle: 'Tocá de nuevo para confirmar',
    },
    releasing: {
      bg: 'linear-gradient(135deg, #475569 0%, #334155 100%)',
      shadow: '0 8px 24px rgba(51,65,85,0.35)',
      title: 'Finalizando...',
      subtitle: 'Guardando tu transcripción',
    },
  };
  const v = visuals[state];

  return createPortal(
    <div
      style={{
        position: 'fixed',
        bottom: '24px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 9998,
        animation: 'ltFabIn 0.3s ease',
      }}
    >
      <style>{`
        @keyframes ltFabIn { from { opacity: 0; transform: translateX(-50%) translateY(16px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }
        @keyframes ltPulseRing {
          0% { box-shadow: 0 0 0 0 rgba(220,38,38,0.45), 0 8px 24px rgba(220,38,38,0.35); }
          70% { box-shadow: 0 0 0 14px rgba(220,38,38,0), 0 8px 24px rgba(220,38,38,0.35); }
          100% { box-shadow: 0 0 0 0 rgba(220,38,38,0), 0 8px 24px rgba(220,38,38,0.35); }
        }
        @keyframes ltWave {
          0%, 100% { transform: scaleY(0.4); }
          50% { transform: scaleY(1); }
        }
        #lt-fab:active { transform: scale(0.96); }
      `}</style>
      <button
        id="lt-fab"
        onClick={onTap}
        disabled={state === 'releasing'}
        title={v.subtitle}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          padding: '12px 22px 12px 14px',
          borderRadius: '9999px',
          border: 'none',
          cursor: state === 'releasing' ? 'wait' : 'pointer',
          color: '#ffffff',
          fontSize: '14px',
          fontWeight: 600,
          transition: 'transform 0.1s ease, background 0.2s ease',
          background: v.bg,
          animation: state === 'recording' ? 'ltPulseRing 1.6s ease-out infinite' : 'none',
          boxShadow: v.shadow,
        }}
      >
        <span
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '38px',
            height: '38px',
            borderRadius: '50%',
            background: 'rgba(255,255,255,0.18)',
            flexShrink: 0,
          }}
        >
          <MicIcon size={20} />
        </span>
        <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', lineHeight: 1.25 }}>
          <span>{v.title}</span>
          <span style={{ fontSize: '11px', fontWeight: 500, opacity: 0.85 }}>{v.subtitle}</span>
        </span>
        {state === 'recording' && (
          <span style={{ display: 'flex', alignItems: 'flex-end', gap: '3px', height: '20px', marginLeft: '4px' }}>
            {[0, 1, 2, 3].map((i) => (
              <span
                key={i}
                style={{
                  width: '3px',
                  height: '20px',
                  borderRadius: '2px',
                  background: 'rgba(255,255,255,0.9)',
                  animation: `ltWave 1s ease-in-out ${i * 0.15}s infinite`,
                  transformOrigin: 'bottom',
                }}
              />
            ))}
          </span>
        )}
      </button>
    </div>,
    document.body,
  );
}

export function LiveTranscriber({
  meetingId,
  currentSpeakerId,
  currentTopicId,
  transcriptionEnabled = true,
  onBehalfOf,
}: LiveTranscriberProps) {
  const { user } = useAuthState();
  const [hasActivated, setHasActivated] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [confirmingEnd, setConfirmingEnd] = useState(false);
  const [releasing, setReleasing] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunkTimeoutRef = useRef<any>(null);
  const confirmTimeoutRef = useRef<any>(null);

  const isSpeaking = !!(user && currentSpeakerId && currentSpeakerId === user.id && transcriptionEnabled);

  // Keep latest state in refs to prevent closure stale state bugs
  const isSpeakingRef = useRef(isSpeaking);
  const currentTopicIdRef = useRef(currentTopicId);
  const onBehalfOfRef = useRef(onBehalfOf);
  const mimeTypeRef = useRef('audio/webm');

  useEffect(() => {
    onBehalfOfRef.current = onBehalfOf;
  }, [onBehalfOf]);

  useEffect(() => {
    isSpeakingRef.current = isSpeaking;
    if (!isSpeaking) {
      setHasActivated(false);
      setShowModal(false);
      setConfirmingEnd(false);
      setReleasing(false);
      if (confirmTimeoutRef.current) {
        clearTimeout(confirmTimeoutRef.current);
        confirmTimeoutRef.current = null;
      }
    }
  }, [isSpeaking]);

  useEffect(() => {
    currentTopicIdRef.current = currentTopicId;
    // If topic changes while recording, trigger slice immediately to flush old topic audio
    if (isSpeaking && mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      try {
        mediaRecorderRef.current.stop();
      } catch (e) {
        console.error('Error stopping recorder on topic change:', e);
      }
    }
  }, [currentTopicId, isSpeaking]);

  const cleanupRecording = () => {
    if (chunkTimeoutRef.current) {
      clearTimeout(chunkTimeoutRef.current);
      chunkTimeoutRef.current = null;
    }
    if (mediaRecorderRef.current) {
      if (mediaRecorderRef.current.state === 'recording') {
        try {
          mediaRecorderRef.current.stop();
        } catch (e) {}
      }
      mediaRecorderRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch (e) {}
      });
      streamRef.current = null;
    }
  };

  // Manage microphone stream and media recorder lifecycle
  useEffect(() => {
    if (!isSpeaking) {
      cleanupRecording();
      return;
    }

    if (!hasActivated) {
      // Show modal for the first activation (required for Safari user-gesture policy)
      setShowModal(true);
      return;
    }

    setShowModal(false);

    // Speaker is active and has activated microphone
    const startRecording = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamRef.current = stream;

        // Determine best mimeType
        let mimeType = 'audio/webm';
        if (typeof MediaRecorder.isTypeSupported === 'function') {
          if (MediaRecorder.isTypeSupported('audio/webm')) mimeType = 'audio/webm';
          else if (MediaRecorder.isTypeSupported('audio/mp4')) mimeType = 'audio/mp4';
          else if (MediaRecorder.isTypeSupported('audio/ogg')) mimeType = 'audio/ogg';
          else if (MediaRecorder.isTypeSupported('audio/wav')) mimeType = 'audio/wav';
        }
        mimeTypeRef.current = mimeType;

        let audioChunks: Blob[] = [];
        const recorder = new MediaRecorder(stream, { mimeType });
        mediaRecorderRef.current = recorder;

        recorder.ondataavailable = (event) => {
          if (event.data && event.data.size > 0) {
            audioChunks.push(event.data);
          }
        };

        recorder.onstop = async () => {
          const audioBlob = new Blob(audioChunks, { type: mimeTypeRef.current });
          audioChunks = [];

          const activeTopicId = currentTopicIdRef.current;
          if (audioBlob.size > 0 && isSpeakingRef.current && activeTopicId) {
            let filename = 'audio.webm';
            if (mimeTypeRef.current.includes('mp4')) filename = 'audio.mp4';
            else if (mimeTypeRef.current.includes('wav')) filename = 'audio.wav';
            else if (mimeTypeRef.current.includes('ogg')) filename = 'audio.ogg';

            topicsApi
              .addTranscriptionAudio(meetingId, activeTopicId, audioBlob, filename, onBehalfOfRef.current ?? undefined)
              .catch((err) => {
                console.error('Error transcribing audio chunk:', err);
              });
          }

          // Restart recording if still speaking
          if (isSpeakingRef.current && currentTopicIdRef.current && mediaRecorderRef.current && stream.active) {
            try {
              mediaRecorderRef.current.start();
              scheduleNextSlice();
            } catch (e) {
              console.error('Error restarting media recorder:', e);
            }
          }
        };

        const scheduleNextSlice = () => {
          if (chunkTimeoutRef.current) clearTimeout(chunkTimeoutRef.current);
          chunkTimeoutRef.current = setTimeout(() => {
            if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
              try {
                mediaRecorderRef.current.stop();
              } catch (e) {
                console.error('Error stopping recorder in timeout:', e);
              }
            }
          }, 8000); // 8-second segments
        };

        recorder.start();
        scheduleNextSlice();

      } catch (err) {
        console.error('Failed to start audio recording:', err);
        toast.error('No se pudo acceder al micrófono para la transcripción en vivo.');
        setHasActivated(false);
      }
    };

    startRecording();

    return () => {
      cleanupRecording();
    };
  }, [isSpeaking, hasActivated, meetingId]);

  /**
   * Fin de intervención autoiniciado por el orador (dos toques):
   * 1er toque: pide confirmación (se revierte solo a los 4s).
   * 2do toque: descarga el fragmento de audio en curso mientras el servidor
   * todavía lo reconoce como orador, y recién después libera la palabra.
   */
  const handleEndIntervention = async () => {
    if (releasing) return;

    if (!confirmingEnd) {
      setConfirmingEnd(true);
      if (confirmTimeoutRef.current) clearTimeout(confirmTimeoutRef.current);
      confirmTimeoutRef.current = setTimeout(() => setConfirmingEnd(false), 4000);
      return;
    }

    if (confirmTimeoutRef.current) {
      clearTimeout(confirmTimeoutRef.current);
      confirmTimeoutRef.current = null;
    }
    setConfirmingEnd(false);
    setReleasing(true);

    try {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        try {
          mediaRecorderRef.current.stop();
        } catch (e) {}
        // Da tiempo a que onstop dispare la subida del último fragmento
        await new Promise((r) => setTimeout(r, 350));
      }
      await queueApi.releaseFloor(meetingId);
      toast.success('Terminaste tu intervención. Tu transcripción quedó guardada.');
      // El snapshot entrante pone isSpeaking en false y desmonta el botón.
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al terminar la intervención');
      setReleasing(false);
    }
  };

  const fabState: FabState = releasing ? 'releasing' : confirmingEnd ? 'confirming' : 'recording';

  return (
    <>
      {showModal && (
        <MicrophoneModal
          onActivate={() => {
            setShowModal(false);
            setHasActivated(true);
          }}
        />
      )}
      {isSpeaking && hasActivated && (
        <MicFloatingButton state={fabState} onTap={handleEndIntervention} onBehalfOf={onBehalfOf} />
      )}
    </>
  );
}
