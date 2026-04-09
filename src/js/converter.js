/**
 * 转换核心逻辑模块
 */

import { parseMagnetUri, generateMagnetUri } from './magnet.js';
import { parseTorrent, generateTorrentBlob } from './torrent.js';

/**
 * 单条磁力链接转种子文件
 * @param {string} magnetUri
 * @returns {{ success: true, name: string, blob: Blob, infoHash: string } | { success: false, input: string, error: string }}
 */
export function magnetToTorrent(magnetUri) {
  try {
    const { infoHash, name, trackers } = parseMagnetUri(magnetUri);
    const blob = generateTorrentBlob({ infoHash, name, trackers });
    const fileName = name ? `${name}.torrent` : `torrent_${infoHash.substring(0, 8)}.torrent`;
    return { success: true, name: fileName, blob, infoHash };
  } catch (e) {
    return { success: false, input: magnetUri.trim(), error: e.message };
  }
}

/**
 * 批量磁力转种子
 * @param {string} text - 多行 magnet URI
 * @returns {Array<{ success: true, name: string, blob: Blob, infoHash: string } | { success: false, input: string, error: string }>}
 */
export function magnetToTorrentBatch(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  return lines.map(magnetToTorrent);
}

/**
 * 单个种子文件转磁力链接
 * @param {File} file
 * @returns {Promise<{ success: true, fileName: string, magnetUri: string, infoHash: string } | { success: false, fileName: string, error: string }>}
 */
export async function torrentToMagnet(file) {
  try {
    console.log('Processing file:', file.name, 'size:', file.size, 'type:', file.type);
    const buffer = await file.arrayBuffer();
    console.log('ArrayBuffer size:', buffer.byteLength);
    const info = await parseTorrent(buffer);
    const magnetUri = generateMagnetUri(info);
    return { success: true, fileName: file.name, magnetUri, infoHash: info.infoHash };
  } catch (e) {
    console.error('Error processing file:', file.name, e);
    return { success: false, fileName: file.name, error: e.message };
  }
}

/**
 * 批量种子文件转磁力链接
 * @param {FileList|File[]} files
 * @returns {Promise<Array<{ success: true, fileName: string, magnetUri: string, infoHash: string } | { success: false, fileName: string, error: string }>>}
 */
export async function torrentToMagnetBatch(files) {
  return Promise.all(Array.from(files).map(torrentToMagnet));
}
