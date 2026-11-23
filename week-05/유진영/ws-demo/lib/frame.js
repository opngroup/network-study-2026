/**
 * WebSocket 프레임 읽고 쓰기 (RFC 6455 5장)
 * ------------------------------------------------------------------
 * 라이브러리 없이 바이트를 직접 다룬다. 발표에서 "프레임이 실제로 어떻게 생겼나"를
 * 보여 주려고 일부러 손으로 만들었다.
 *
 *   0                   1                   2                   3
 *   0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
 *  +-+-+-+-+-------+-+-------------+-------------------------------+
 *  |F|R|R|R| opcode|M| Payload len |    Extended payload length    |
 *  |I|S|S|S|  (4)  |A|     (7)     |             (16/64)           |
 *  |N|V|V|V|       |S|             |   (if payload len==126/127)   |
 *  | |1|2|3|       |K|             |                               |
 *  +-+-+-+-+-------+-+-------------+ - - - - - - - - - - - - - - - +
 *  |     Masking-key (MASK=1일 때만, 4바이트)  |   Payload Data ...  |
 */

'use strict';

const crypto = require('node:crypto');

/** 핸드셰이크에서 쓰는 고정 문자열. RFC 6455에 박혀 있는 값 */
const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

const OPCODES = {
  0x0: 'continuation',
  0x1: 'text',
  0x2: 'binary',
  0x8: 'close',
  0x9: 'ping',
  0xa: 'pong',
};

/** Sec-WebSocket-Key → Sec-WebSocket-Accept: base64(SHA-1(key + GUID)) */
function acceptFor(key) {
  return crypto.createHash('sha1').update(key + WS_GUID).digest('base64');
}

/**
 * 프레임 하나를 만든다.
 * 서버 → 클라이언트는 마스크를 씌우지 않는다(mask=false). 클라이언트 → 서버는 반드시 씌운다.
 */
function encodeFrame({ opcode, payload = Buffer.alloc(0), fin = true, mask = false }) {
  const data = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
  const len = data.length;
  let header;
  if (len < 126) {
    header = Buffer.alloc(2);
    header[1] = len;
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  header[0] = (fin ? 0x80 : 0) | opcode;
  if (!mask) return Buffer.concat([header, data]);

  header[1] |= 0x80;
  const key = crypto.randomBytes(4);
  const masked = Buffer.alloc(len);
  for (let i = 0; i < len; i++) masked[i] = data[i] ^ key[i % 4];
  return Buffer.concat([header, key, masked]);
}

/**
 * 버퍼 앞에서 프레임 하나를 읽는다. 아직 다 안 왔으면 null.
 * 돌려주는 값: { fin, opcode, masked, maskKey, payload, headerBytes, size }
 */
function decodeFrame(buf) {
  if (buf.length < 2) return null;
  const fin = (buf[0] & 0x80) !== 0;
  const rsv = buf[0] & 0x70;
  const opcode = buf[0] & 0x0f;
  const masked = (buf[1] & 0x80) !== 0;
  let len = buf[1] & 0x7f;
  let offset = 2;

  if (len === 126) {
    if (buf.length < 4) return null;
    len = buf.readUInt16BE(2);
    offset = 4;
  } else if (len === 127) {
    if (buf.length < 10) return null;
    const big = buf.readBigUInt64BE(2);
    if (big > BigInt(Number.MAX_SAFE_INTEGER)) throw new FrameError(1009, '프레임이 너무 큽니다');
    len = Number(big);
    offset = 10;
  }

  let maskKey = null;
  if (masked) {
    if (buf.length < offset + 4) return null;
    maskKey = buf.subarray(offset, offset + 4);
    offset += 4;
  }
  if (buf.length < offset + len) return null;

  const payload = Buffer.from(buf.subarray(offset, offset + len));
  if (masked) for (let i = 0; i < len; i++) payload[i] ^= maskKey[i % 4];

  return {
    fin,
    rsv,
    opcode,
    masked,
    maskKey: maskKey ? Buffer.from(maskKey) : null,
    payload,
    headerBytes: offset,
    size: offset + len,
    raw: Buffer.from(buf.subarray(0, offset + len)),
  };
}

class FrameError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

/** close 프레임 본문: 앞 2바이트가 상태 코드, 나머지는 이유(UTF-8) */
function closePayload(code, reason = '') {
  const body = Buffer.alloc(2 + Buffer.byteLength(reason));
  body.writeUInt16BE(code, 0);
  body.write(reason, 2);
  return body;
}

function parseClose(payload) {
  if (payload.length < 2) return { code: 1005, reason: '' }; // 1005: 코드 없이 닫음 (선 위로는 안 나가는 값)
  return { code: payload.readUInt16BE(0), reason: payload.subarray(2).toString('utf8') };
}

/** 발표용: 바이트를 16진수로, 너무 길면 줄인다 */
function hex(buf, max = 24) {
  const parts = [...buf.subarray(0, max)].map((b) => b.toString(16).padStart(2, '0'));
  return parts.join(' ') + (buf.length > max ? ` … (+${buf.length - max}바이트)` : '');
}

/** 발표용: 프레임 머리를 사람이 읽는 한 줄로 */
function describe(frame) {
  const name = OPCODES[frame.opcode] ?? `unknown(${frame.opcode})`;
  const bits = `FIN=${frame.fin ? 1 : 0} opcode=${frame.opcode}(${name}) MASK=${frame.masked ? 1 : 0} len=${frame.payload.length}`;
  return frame.masked ? `${bits} key=${hex(frame.maskKey)}` : bits;
}

module.exports = {
  WS_GUID,
  OPCODES,
  acceptFor,
  encodeFrame,
  decodeFrame,
  closePayload,
  parseClose,
  FrameError,
  hex,
  describe,
};
