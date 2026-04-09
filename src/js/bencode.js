/**
 * Bencode 编解码器
 * 支持 integer、string、list、dict 四种类型
 */

/**
 * 将 Uint8Array 解码为 Bencode 数据
 * @param {Uint8Array} buffer
 * @returns {{ value: any, offset: number }}
 */
export function decode(buffer) {
  let offset = 0;

  function readValue() {
    if (offset >= buffer.length) {
      throw new Error('Unexpected end of bencode data');
    }

    const byte = buffer[offset];

    if (byte === 0x69) { // 'i' - integer
      return readInteger();
    } else if (byte === 0x6C) { // 'l' - list
      return readList();
    } else if (byte === 0x64) { // 'd' - dict
      return readDict();
    } else if (byte >= 0x30 && byte <= 0x39) { // '0'-'9' - string
      return readString();
    }

    throw new Error(`Unexpected bencode byte: 0x${byte.toString(16)} at offset ${offset}`);
  }

  function readInteger() {
    offset++; // skip 'i'
    const end = indexOf(buffer, 0x65, offset); // 'e'
    if (end === -1) throw new Error('Unterminated bencode integer');
    const str = utf8Decode(buffer, offset, end);
    offset = end + 1;
    const num = parseInt(str, 10);
    if (Number.isNaN(num)) throw new Error(`Invalid bencode integer: ${str}`);
    return num;
  }

  function readString() {
    const colon = indexOf(buffer, 0x3A, offset); // ':'
    if (colon === -1) throw new Error('Unterminated bencode string length');
    const lenStr = utf8Decode(buffer, offset, colon);
    const len = parseInt(lenStr, 10);
    if (Number.isNaN(len) || len < 0) throw new Error(`Invalid bencode string length: ${lenStr}`);
    offset = colon + 1;
    if (offset + len > buffer.length) throw new Error('Bencode string extends beyond buffer');
    const value = buffer.slice(offset, offset + len);
    offset += len;
    return value; // Uint8Array
  }

  function readList() {
    offset++; // skip 'l'
    const list = [];
    while (buffer[offset] !== 0x65) { // 'e'
      list.push(readValue());
    }
    offset++; // skip 'e'
    return list;
  }

  function readDict() {
    offset++; // skip 'd'
    const dict = {};
    // bencode dict keys must be in sorted order
    while (buffer[offset] !== 0x65) { // 'e'
      const key = readString();
      const keyStr = utf8Decode(key);
      dict[keyStr] = readValue();
    }
    offset++; // skip 'e'
    return dict;
  }

  const result = readValue();
  return result;
}

/**
 * 将 JS 值编码为 Bencode 格式的 Uint8Array
 * @param {any} value
 * @returns {Uint8Array}
 */
export function encode(value) {
  const parts = [];

  if (value === null || value === undefined) {
    throw new Error('Cannot bencode null/undefined');
  }

  if (typeof value === 'number') {
    // integer
    parts.push(uint8From([0x69])); // 'i'
    parts.push(uint8FromString(`${value}`));
    parts.push(uint8From([0x65])); // 'e'
  } else if (typeof value === 'string') {
    // string
    const bytes = uint8FromString(value);
    parts.push(uint8FromString(`${bytes.length}`));
    parts.push(uint8From([0x3A])); // ':'
    parts.push(bytes);
  } else if (value instanceof Uint8Array) {
    // raw bytes (from decode)
    parts.push(uint8FromString(`${value.length}`));
    parts.push(uint8From([0x3A])); // ':'
    parts.push(value);
  } else if (Array.isArray(value)) {
    // list
    parts.push(uint8From([0x6C])); // 'l'
    for (const item of value) {
      parts.push(encode(item));
    }
    parts.push(uint8From([0x65])); // 'e'
  } else if (typeof value === 'object') {
    // dict - keys must be sorted
    const keys = Object.keys(value).sort();
    parts.push(uint8From([0x64])); // 'd'
    for (const key of keys) {
      const keyBytes = uint8FromString(key);
      parts.push(uint8FromString(`${keyBytes.length}`));
      parts.push(uint8From([0x3A])); // ':'
      parts.push(keyBytes);
      parts.push(encode(value[key]));
    }
    parts.push(uint8From([0x65])); // 'e'
  } else {
    throw new Error(`Cannot bencode type: ${typeof value}`);
  }

  return concatUint8Arrays(parts);
}

// --- Helpers ---

function indexOf(buffer, byte, start) {
  for (let i = start; i < buffer.length; i++) {
    if (buffer[i] === byte) return i;
  }
  return -1;
}

function utf8Decode(buffer, start, end) {
  return new TextDecoder().decode(buffer.slice(start, end));
}

function uint8FromString(str) {
  return new TextEncoder().encode(str);
}

function uint8From(arr) {
  return new Uint8Array(arr);
}

function concatUint8Arrays(arrays) {
  const total = arrays.reduce((sum, a) => sum + a.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}
