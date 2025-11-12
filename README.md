# Real-Time Transcription Demo

Next.js app that streams microphone audio to a WebSocket backend for real-time transcription.

## Quick Start

```bash
# Install dependencies
bun install

# Run development server
bun dev

# Open http://localhost:3000
```

## Environment Configuration

Create `.env.local` (optional - has defaults):

```bash
NEXT_PUBLIC_API_BASE_URL=https://api.scribemd.com
NEXT_PUBLIC_BEARER_TOKEN=sm-874a6b0368632f1c3d711278ccfdaeb7462847facd6a4c2f
```

## Authentication Flow

### Step 1: Fetch WebSocket Token

**Endpoint:** `POST https://api.scribemd.com/api/v1/auth/grant`

**Request:**
```bash
POST /api/v1/auth/grant
Authorization: Bearer sm-874a6b0368632f1c3d711278ccfdaeb7462847facd6a4c2f
Content-Type: application/json

{
  "type": "websocket"
}
```

**Response:**
```json
{
  "access_token": "ws-67844d680dfa27e493049d80b06037d9b0c37bfeda1a5a5eb2ca13e02c2a387f",
  "expires_at": "2025-11-11T02:50:43.291Z",
  "key_type": "websocket"
}
```

**Token Caching:** Token is cached in memory and reused until expired.

---

## WebSocket Connection

### Step 2: Connect to Transcription Service

**WebSocket URL:**
```
wss://stt.scribemd.ai/v1/listen?access_token={token}&language={lang}&service={provider}
```

**Example:**
```
wss://stt.scribemd.ai/v1/listen?access_token=ws-67844d680dfa27...&language=en-US&service=deepgram
```

**Query Parameters:**
- `access_token` - WebSocket token from auth endpoint (required)
- `language` - Language code: `en-US`, `en-GB`, `es-ES`, `fr-FR`, `de-DE` (required)
- `service` - Provider: `deepgram`, `aws`, `azure` (required)

---

## Audio Streaming

### Step 3: Stream Raw PCM Audio

**Audio Format:**
- **Type:** Raw PCM (Int16Array)
- **Sample Rate:** 16,000 Hz
- **Channels:** 1 (mono)
- **Bit Depth:** 16-bit signed integer
- **Byte Order:** Little-endian
- **Chunk Size:** 4096 samples (~8192 bytes per chunk)

**Implementation:**
```typescript
// Browser sends raw PCM data via WebSocket
const audioContext = new AudioContext({ sampleRate: 16000 });
const processor = audioContext.createScriptProcessor(4096, 1, 1);

processor.onaudioprocess = (e) => {
  const inputData = e.inputBuffer.getChannelData(0); // Float32Array
  const pcmData = new Int16Array(inputData.length);

  // Convert Float32 [-1.0, 1.0] to Int16 [-32768, 32767]
  for (let i = 0; i < inputData.length; i++) {
    pcmData[i] = Math.max(-1, Math.min(1, inputData[i])) * 0x7FFF;
  }

  websocket.send(pcmData.buffer); // Send binary PCM data
};
```

---

## WebSocket Messages (from Backend)

### Message Format

**Interim Transcript (partial result):**
```json
{
  "channel": {
    "alternatives": [
      {
        "transcript": "hello this is"
      }
    ]
  },
  "is_final": false
}
```

**Final Transcript (complete result):**
```json
{
  "channel": {
    "alternatives": [
      {
        "transcript": "hello this is a test."
      }
    ]
  },
  "is_final": true
}
```

**Error Message:**
```json
{
  "error": "Invalid token"
}
```

---

## Complete Flow Example

```
1. User clicks "Start Transcription"
   ↓
2. App fetches WebSocket token
   POST /api/v1/auth/grant
   → { access_token: "ws-...", expires_at: "...", key_type: "websocket" }
   ↓
3. App requests microphone access
   navigator.mediaDevices.getUserMedia({ audio: true })
   ↓
4. App connects WebSocket
   wss://stt.scribemd.ai/v1/listen?access_token=ws-...&service=deepgram&...
   ↓
5. App streams raw PCM audio (every ~256ms)
   ws.send(pcmData.buffer) // 8192 bytes of Int16 PCM
   ↓
6. Backend sends transcription results
   ← { channel: { alternatives: [{ transcript: "..." }] }, is_final: false }
   ← { channel: { alternatives: [{ transcript: "..." }] }, is_final: true }
   ↓
7. App displays transcripts in UI
```

---

## Response Codes

### HTTP API
- `200 OK` - Token fetched successfully
- `401 Unauthorized` - Invalid bearer token
- `404 Not Found` - Endpoint not found
- `500 Internal Server Error` - Server error

### WebSocket
- `101 Switching Protocols` - Connection established
- `403 Forbidden` - Invalid access token
- `1000 Normal Closure` - Clean disconnect
- `1006 Abnormal Closure` - Connection dropped

---

## Troubleshooting

**No transcription results?**
- Check browser console for WebSocket messages
- Verify microphone is active (check audio chunks in logs)
- Confirm backend receives PCM audio (check backend logs)

**401 Unauthorized?**
- Verify `NEXT_PUBLIC_BEARER_TOKEN` is correct
- Check token hasn't expired

**WebSocket closes immediately?**
- Verify `access_token` query parameter is present
- Check backend logs for validation errors
