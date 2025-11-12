'use client';

import { useEffect, useRef, useState } from 'react';
import { fetchWebSocketToken, WebSocketToken } from '@/lib/api';

type ConnectionState = 'idle' | 'connecting' | 'connected' | 'error';

export default function TranscriptionClient() {
  const [connectionState, setConnectionState] = useState<ConnectionState>('idle');
  const [transcript, setTranscript] = useState<string[]>([]);
  const [interimTranscript, setInterimTranscript] = useState<string>('');
  const [service, setService] = useState<'deepgram' | 'aws' | 'azure'>('deepgram');
  const [language, setLanguage] = useState<string>('en-US');

  const wsRef = useRef<WebSocket | null>(null);
  const wsTokenRef = useRef<WebSocketToken | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioProcessorRef = useRef<ScriptProcessorNode | null>(null);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      stopTranscription();
    };
  }, []);

  const initializeTranscription = async () => {
    try {
      setConnectionState('connecting');
      console.log('Starting transcription...');

      // Step 1: Get WebSocket token (fetch new if expired)
      let wsToken = wsTokenRef.current;
      if (!wsToken || new Date(wsToken.expires_at) <= new Date()) {
        console.log('Fetching WebSocket token...');
        wsToken = await fetchWebSocketToken();
        wsTokenRef.current = wsToken;
        console.log('✅ Token received');
      }

      // Step 2: Request microphone access
      console.log('Requesting microphone access...');
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
        },
      });
      audioStreamRef.current = stream;
      console.log('✅ Microphone access granted');

      // Step 3: Connect WebSocket
      const wsUrl = `wss://stt.scribemd.ai/v1/listen?access_token=${encodeURIComponent(wsToken.access_token)}&language=${language}&service=${service}`;

      console.log('Connecting to WebSocket...');
      console.log('WebSocket URL:', wsUrl.replace(wsToken.access_token, '***TOKEN***'));
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      console.log('WebSocket created, initial state:', ws.readyState);

      ws.onopen = () => {
        console.log('✅ WebSocket connected (readyState: OPEN)');
        console.log('WebSocket details:', {
          readyState: ws.readyState,
          protocol: ws.protocol,
          extensions: ws.extensions,
        });
        setConnectionState('connected');
      };

      ws.onmessage = (event: MessageEvent) => {
        console.log('📥 Message received from backend:', event.data);

        try {
          const data = JSON.parse(event.data);
          console.log('📋 Parsed message:', JSON.stringify(data, null, 2));

          // Check for errors
          if (data.error) {
            console.error('❌ Backend error:', data.error);
            return;
          }

          // Extract transcript
          const transcript = data.channel?.alternatives?.[0]?.transcript;
          console.log('📝 Extracted transcript:', transcript, 'is_final:', data.is_final);

          if (transcript) {
            if (data.is_final) {
              console.log('✅ Final transcript:', transcript);
              setTranscript((prev) => [...prev, transcript]);
              setInterimTranscript('');
            } else {
              console.log('⏳ Interim transcript:', transcript);
              setInterimTranscript(transcript);
            }
          } else {
            console.log('⚠️ No transcript in message');
          }
        } catch (error) {
          console.error('❌ Failed to parse message:', error);
        }
      };

      ws.onerror = (error: Event) => {
        console.error('❌ WebSocket error:', error);
        console.error('WebSocket state at error:', ws.readyState);
        setConnectionState('error');
      };

      ws.onclose = (event: CloseEvent) => {
        console.log('🔌 WebSocket closed:', {
          code: event.code,
          reason: event.reason,
          wasClean: event.wasClean,
        });
        setConnectionState('idle');
      };

      // Step 4: Start streaming raw PCM audio to WebSocket
      console.log('Starting raw PCM audio streaming...');

      // Create audio context with 16kHz sample rate (matching backend expectations)
      const audioContext = new AudioContext({ sampleRate: 16000 });
      audioContextRef.current = audioContext;
      console.log('✅ AudioContext created:', {
        sampleRate: audioContext.sampleRate,
        state: audioContext.state,
      });

      // Create media stream source
      const source = audioContext.createMediaStreamSource(stream);
      console.log('✅ MediaStreamSource created');

      // Create script processor (4096 buffer size, 1 input channel, 1 output channel)
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      audioProcessorRef.current = processor;

      let audioChunkCount = 0;

      // Process audio data and send raw PCM to WebSocket
      processor.onaudioprocess = (e) => {
        if (ws.readyState === WebSocket.OPEN) {
          audioChunkCount++;

          // Get audio data from the first channel (mono)
          const inputData = e.inputBuffer.getChannelData(0);

          // Convert Float32Array [-1.0, 1.0] to Int16Array [-32768, 32767] (PCM 16-bit)
          const pcmData = new Int16Array(inputData.length);
          for (let i = 0; i < inputData.length; i++) {
            // Clamp values to [-1, 1] and scale to 16-bit range
            const clamped = Math.max(-1, Math.min(1, inputData[i]));
            pcmData[i] = clamped * 0x7FFF;
          }

          if (audioChunkCount % 10 === 0) { // Log every 10th chunk to avoid spam
            console.log(`🎵 Audio chunk #${audioChunkCount}:`, {
              samples: inputData.length,
              pcmBytes: pcmData.byteLength,
              wsReadyState: ws.readyState,
              wsOpen: ws.readyState === WebSocket.OPEN,
              firstSamples: Array.from(pcmData.slice(0, 5)), // Show first 5 samples
            });
          }

          // Send raw PCM data (matches mobile app approach)
          ws.send(pcmData.buffer);

          if (audioChunkCount % 10 === 0) {
            console.log(`📤 Sent raw PCM chunk #${audioChunkCount} (${pcmData.byteLength} bytes)`);
          }
        } else {
          if (audioChunkCount === 0 || audioChunkCount % 50 === 0) {
            console.warn('⚠️ WebSocket not open, cannot send audio. State:', ws.readyState);
          }
        }
      };

      // Connect audio nodes
      source.connect(processor);
      processor.connect(audioContext.destination);

      console.log('✅ Audio pipeline connected (raw PCM streaming)');

    } catch (error: any) {
      console.error('Failed to initialize:', error);
      setConnectionState('error');
      alert(`Failed to initialize transcription: ${error.message}`);
    }
  };

  const stopTranscription = () => {
    console.log('[stopTranscription] Stopping transcription...');

    // Disconnect and clean up audio processor
    if (audioProcessorRef.current) {
      console.log('[stopTranscription] Disconnecting audio processor...');
      audioProcessorRef.current.disconnect();
      audioProcessorRef.current = null;
    }

    // Close and clean up audio context
    if (audioContextRef.current) {
      console.log('[stopTranscription] Closing audio context...');
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    // Stop audio stream
    if (audioStreamRef.current) {
      console.log('[stopTranscription] Stopping audio tracks...');
      audioStreamRef.current.getTracks().forEach((track) => track.stop());
      audioStreamRef.current = null;
    }

    // Close WebSocket connection
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      console.log('[stopTranscription] Closing WebSocket...');
      wsRef.current.close();
      wsRef.current = null;
    }

    setConnectionState('idle');
    console.log('✅ Transcription stopped');
  };

  const clearTranscript = () => {
    setTranscript([]);
    setInterimTranscript('');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-lg shadow-xl p-8">
          <h1 className="text-4xl font-bold text-gray-800 mb-2">
            Live Transcription Demo
          </h1>
          <p className="text-gray-600 mb-8">
            Using Deepgram SDK Wrapper with Multi-Provider Support
          </p>

          {/* Settings */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Service Provider
              </label>
              <select
                value={service}
                onChange={(e) => setService(e.target.value as any)}
                disabled={connectionState !== 'idle'}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
              >
                <option value="deepgram">Deepgram</option>
                <option value="aws">AWS Transcribe</option>
                <option value="azure">Azure Speech</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Language
              </label>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                disabled={connectionState !== 'idle'}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
              >
                <option value="en-US">English (US)</option>
                <option value="en-GB">English (UK)</option>
                <option value="es-ES">Spanish</option>
                <option value="fr-FR">French</option>
                <option value="de-DE">German</option>
              </select>
            </div>
          </div>

          {/* Controls */}
          <div className="flex gap-4 mb-8">
            {connectionState === 'idle' || connectionState === 'error' ? (
              <button
                onClick={initializeTranscription}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-lg transition duration-200 ease-in-out transform hover:scale-105"
              >
                Start Transcription
              </button>
            ) : (
              <button
                onClick={stopTranscription}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white font-semibold py-3 px-6 rounded-lg transition duration-200 ease-in-out transform hover:scale-105"
              >
                Stop Transcription
              </button>
            )}

            <button
              onClick={clearTranscript}
              disabled={connectionState !== 'idle'}
              className="bg-gray-600 hover:bg-gray-700 text-white font-semibold py-3 px-6 rounded-lg transition duration-200 ease-in-out disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              Clear
            </button>
          </div>

          {/* Status Badge */}
          <div className="mb-6">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-700">Status:</span>
              <span
                className={`px-3 py-1 rounded-full text-sm font-semibold ${
                  connectionState === 'idle'
                    ? 'bg-gray-200 text-gray-700'
                    : connectionState === 'connecting'
                    ? 'bg-yellow-200 text-yellow-800'
                    : connectionState === 'connected'
                    ? 'bg-green-200 text-green-800'
                    : 'bg-red-200 text-red-800'
                }`}
              >
                {connectionState.toUpperCase()}
              </span>
            </div>
          </div>

          {/* Transcript Display */}
          <div className="bg-gray-50 rounded-lg p-6 min-h-[300px] max-h-[500px] overflow-y-auto">
            <h2 className="text-xl font-semibold text-gray-800 mb-4">Transcript</h2>

            {transcript.length === 0 && !interimTranscript ? (
              <p className="text-gray-400 italic">
                Start transcription to see results here...
              </p>
            ) : (
              <div className="space-y-2">
                {transcript.map((text, index) => (
                  <p key={index} className="text-gray-800 leading-relaxed">
                    {text}
                  </p>
                ))}
                {interimTranscript && (
                  <p className="text-gray-500 italic leading-relaxed">
                    {interimTranscript}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
