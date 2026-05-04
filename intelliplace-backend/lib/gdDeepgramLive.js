import WebSocket from 'ws';

function stripEnvQuotes(value) {
  if (value == null) return '';
  const s = String(value).trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1).trim();
  }
  return s;
}

/**
 * One browser → Deepgram v1 listen WebSocket (linear16 / 48kHz mono).
 * Partial + final transcripts forwarded via callbacks.
 */
export class GdDeepgramLiveSession {
  constructor({ apiKey, sampleRate = 48000, onPartial, onFinal, onError }) {
    this.apiKey = stripEnvQuotes(apiKey);
    const sr = Number(sampleRate);
    this.sampleRate =
      Number.isFinite(sr) && sr >= 8000 && sr <= 48000 ? Math.floor(sr) : 48000;
    this.onPartial = onPartial;
    this.onFinal = onFinal;
    this.onError = onError;
    this.ws = null;
    this.accumulatedFinals = [];
    this.lastPartial = '';
    this.keepAliveId = null;
  }

  connect() {
    return new Promise((resolve, reject) => {
      if (!this.apiKey) {
        reject(new Error('Deepgram API key not configured'));
        return;
      }
      const params = new URLSearchParams({
        model: 'nova-2',
        encoding: 'linear16',
        sample_rate: String(this.sampleRate),
        channels: '1',
        interim_results: 'true',
        smart_format: 'true',
        punctuate: 'true',
      });
      const url = `wss://api.deepgram.com/v1/listen?${params.toString()}`;
      this.ws = new WebSocket(url, {
        headers: { Authorization: `Token ${this.apiKey}` },
      });

      const t = setTimeout(() => reject(new Error('Deepgram connect timeout')), 12_000);

      this.ws.once('open', () => {
        clearTimeout(t);
        this.keepAliveId = setInterval(() => {
          if (this.ws?.readyState === WebSocket.OPEN) {
            try {
              this.ws.send(JSON.stringify({ type: 'KeepAlive' }));
            } catch (_) {}
          }
        }, 4000);
        resolve();
      });

      this.ws.on('message', (buf) => this._onMessage(buf));
      this.ws.once('error', (err) => {
        clearTimeout(t);
        this.onError?.(err);
        reject(err);
      });
    });
  }

  sendPcmBuffer(buf) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    try {
      this.ws.send(buf);
    } catch (e) {
      this.onError?.(e);
    }
  }

  async close() {
    if (this.keepAliveId) {
      clearInterval(this.keepAliveId);
      this.keepAliveId = null;
    }
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify({ type: 'CloseStream' }));
      } catch (_) {}
      await new Promise((r) => setTimeout(r, 350));
    }
    try {
      this.ws?.terminate();
    } catch (_) {}
    this.ws = null;
  }

  getFullText() {
    return this.accumulatedFinals.join(' ').replace(/\s+/g, ' ').trim();
  }

  /** Full committed text plus current interim (for live captions). */
  getDisplayText() {
    const finals = this.getFullText();
    const p = (this.lastPartial || '').trim();
    if (finals && p) return `${finals} ${p}`;
    return finals || p;
  }

  _onMessage(buf) {
    let msg;
    try {
      msg = JSON.parse(buf.toString());
    } catch {
      return;
    }
    if (msg.type === 'Error' || msg.error) {
      this.onError?.(new Error(msg.error?.message || msg.message || 'Deepgram error'));
      return;
    }
    if (msg.type !== 'Results') return;

    const ch = msg.channel || msg.results?.channels?.[0];
    const alt = ch?.alternatives?.[0];
    const transcript = (alt?.transcript || '').trim();
    if (!transcript) return;

    const isFinal = !!msg.is_final;

    if (isFinal) {
      this.accumulatedFinals.push(transcript);
      this.onFinal?.(transcript, this.getFullText());
      this.lastPartial = '';
    } else {
      this.lastPartial = transcript;
      this.onPartial?.(transcript);
    }
  }
}
