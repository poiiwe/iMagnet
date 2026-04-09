/**
 * .torrent 文件解析与生成模块
 */

import { decode, encode } from './bencode.js';

/**
 * 解析 .torrent 文件的 ArrayBuffer
 * @param {ArrayBuffer} buffer
 * @returns {{ infoHash: string, name: string, announce: string|null, announceList: string[][], isPrivate: boolean, pieceLength: number|null, pieces: Uint8Array|null, length: number|null, files: Array|null }}
 */
export async function parseTorrent(buffer) {
  if (!buffer || buffer.byteLength === 0) {
    throw new Error('文件为空或读取失败');
  }

  const data = decode(new Uint8Array(buffer));

  if (!data || typeof data !== 'object') {
    throw new Error('无效的 .torrent 文件：根节点不是字典');
  }

  if (!data.info) {
    throw new Error('无效的 .torrent 文件：缺少 info 字段');
  }

  // 计算 info hash：对 info dict 的 bencode 编码求 SHA-1
  const infoEncoded = encode(data.info);
  const infoHash = arrayBufferToHex(await awaitSha1(infoEncoded));

  // 提取基本信息
  const info = data.info;
  const name = info.name instanceof Uint8Array ? decodeUtf8(info.name) : (info.name || '未知');

  // announce / announce-list
  let announce = null;
  if (data.announce) {
    announce = decodeUtf8(data.announce);
  }

  const announceList = [];
  if (data['announce-list'] && Array.isArray(data['announce-list'])) {
    for (const tier of data['announce-list']) {
      if (Array.isArray(tier)) {
        announceList.push(tier.map(t => decodeUtf8(t)));
      }
    }
  }

  // 文件信息
  let length = null;
  let files = null;
  if (info.length !== undefined) {
    // 单文件模式
    length = info.length;
  } else if (info.files && Array.isArray(info.files)) {
    // 多文件模式
    files = info.files.map(f => ({
      path: Array.isArray(f.path) ? f.path.map(p => decodeUtf8(p)).join('/') : decodeUtf8(f.path),
      length: f.length,
    }));
    length = files.reduce((sum, f) => sum + f.length, 0);
  }

  return {
    infoHash,
    name,
    announce,
    announceList,
    isPrivate: !!info['private'],
    pieceLength: info['piece length'] || null,
    pieces: info.pieces || null,
    length,
    files,
  };
}

/**
 * 根据 magnet 信息生成 .torrent 文件的 Blob
 * @param {{ infoHash: string, name: string|null, trackers: string[] }} magnetInfo
 * @returns {Blob}
 */
export function generateTorrentBlob(magnetInfo) {
  const { infoHash, name, trackers } = magnetInfo;

  // 构建一个最小的 .torrent 文件
  // info dict 只包含 info hash 的占位（由于我们没有完整文件数据，
  // 生成的 .torrent 文件仅包含 tracker 信息和空的 info 结构）
  const torrent = {};

  if (name) {
    torrent.info = {
      'length': 0,
      'name': name,
      'piece length': 0,
      'pieces': new Uint8Array(0),
    };
  } else {
    torrent.info = {
      'length': 0,
      'name': `torrent_${infoHash.substring(0, 8)}`,
      'piece length': 0,
      'pieces': new Uint8Array(0),
    };
  }

  if (trackers.length > 0) {
    torrent.announce = trackers[0];
    if (trackers.length > 1) {
      torrent['announce-list'] = trackers.map(t => [t]);
    }
  }

  const encoded = encode(torrent);
  return new Blob([encoded], { type: 'application/x-bittorrent' });
}

/**
 * 计算 SHA-1 哈希（浏览器原生 SubtleCrypto）
 * @param {Uint8Array} data
 * @returns {Promise<ArrayBuffer>}
 */
async function awaitSha1(data) {
  const subtle = window.crypto?.subtle || self.crypto?.subtle;
  if (!subtle) {
    throw new Error('浏览器不支持 crypto.subtle API');
  }
  return subtle.digest('SHA-1', data);
}

function arrayBufferToHex(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

function decodeUtf8(uint8arr) {
  return new TextDecoder().decode(uint8arr);
}
