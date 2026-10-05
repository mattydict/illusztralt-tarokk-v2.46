import { createHash } from 'node:crypto';

const MAGIC = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

function frameText(text) {
  const payload = Buffer.from(text, 'utf8');
  let header;
  if (payload.length < 126) {
    header = Buffer.from([0x81, payload.length]);
  } else if (payload.length < 65536) {
    header = Buffer.alloc(4); header[0] = 0x81; header[1] = 126; header.writeUInt16BE(payload.length, 2);
  } else {
    header = Buffer.alloc(10); header[0] = 0x81; header[1] = 127; header.writeBigUInt64BE(BigInt(payload.length), 2);
  }
  return Buffer.concat([header, payload]);
}

function frameControl(opcode, payload = Buffer.alloc(0)) {
  return Buffer.concat([Buffer.from([0x80 | opcode, payload.length]), payload]);
}

export class MinimalWebSocketPeer {
  constructor(socket, { onMessage, onClose, onError, maxMessageBytes = 32 * 1024 } = {}) {
    this.socket = socket;
    this.buffer = Buffer.alloc(0);
    this.closed = false;
    this.onMessage = onMessage ?? (() => {});
    this.onClose = onClose ?? (() => {});
    this.onError = onError ?? (() => {});
    this.maxMessageBytes = maxMessageBytes;
    socket.on('data', chunk => this.consume(chunk));
    socket.on('close', () => this.finish());
    socket.on('error', err => { this.onError(err); this.finish(); });
  }

  sendJson(payload) {
    if (this.closed) return false;
    try { this.socket.write(frameText(JSON.stringify(payload))); return true; } catch { this.finish(); return false; }
  }

  ping() { if (!this.closed) this.socket.write(frameControl(0x9)); }

  close(code = 1000, reason = '') {
    if (this.closed) return;
    const reasonBuf = Buffer.from(reason.slice(0, 120), 'utf8');
    const payload = Buffer.alloc(2 + reasonBuf.length); payload.writeUInt16BE(code, 0); reasonBuf.copy(payload, 2);
    try { this.socket.write(frameControl(0x8, payload), () => this.socket.end()); } catch { this.socket.destroy(); }
    this.closed = true; this.onClose();
  }

  finish() {
    if (this.closed) return;
    this.closed = true;
    this.onClose();
  }

  consume(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    while (this.buffer.length >= 2) {
      const b0 = this.buffer[0], b1 = this.buffer[1];
      const fin = !!(b0 & 0x80), opcode = b0 & 0x0f, masked = !!(b1 & 0x80);
      let length = b1 & 0x7f, offset = 2;
      if (length === 126) { if (this.buffer.length < 4) return; length = this.buffer.readUInt16BE(2); offset = 4; }
      else if (length === 127) { if (this.buffer.length < 10) return; const n = this.buffer.readBigUInt64BE(2); if (n > BigInt(Number.MAX_SAFE_INTEGER)) return this.close(1009, 'Üzenet túl nagy.'); length = Number(n); offset = 10; }
      const maskOffset = masked ? offset + 4 : offset;
      if (masked && this.buffer.length < maskOffset) return;
      if (length > this.maxMessageBytes) return this.close(1009, 'Üzenet túl nagy.');
      const end = maskOffset + length;
      if (this.buffer.length < end) return;
      const mask = masked ? this.buffer.subarray(offset, offset + 4) : null;
      const payload = Buffer.from(this.buffer.subarray(maskOffset, end));
      this.buffer = this.buffer.subarray(end);
      if (!fin) return this.close(1003, 'Fragmentált üzenet nem támogatott.');
      if (opcode === 0x8) { this.close(1000); return; }
      if (opcode === 0x9) { this.socket.write(frameControl(0xA, payload)); continue; }
      if (opcode !== 0x1) { if (opcode === 0xA) continue; return this.close(1003, 'Csak szöveges üzenet támogatott.'); }
      if (mask) for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i % 4];
      try { this.onMessage(payload.toString('utf8')); } catch (error) { this.onError(error); }
    }
  }
}

export function acceptWebSocketUpgrade(req, socket, head, handlers = {}) {
  const key = req.headers['sec-websocket-key'];
  const version = req.headers['sec-websocket-version'];
  if (typeof key !== 'string' || version !== '13') {
    socket.write('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n'); socket.destroy(); return null;
  }
  const accept = createHash('sha1').update(key + MAGIC).digest('base64');
  socket.write([
    'HTTP/1.1 101 Switching Protocols',
    'Upgrade: websocket',
    'Connection: Upgrade',
    `Sec-WebSocket-Accept: ${accept}`,
    '\r\n',
  ].join('\r\n'));
  const peer = new MinimalWebSocketPeer(socket, handlers);
  if (head?.length) peer.consume(head);
  return peer;
}
