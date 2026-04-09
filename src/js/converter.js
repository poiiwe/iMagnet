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
    console.log('File object:', {
      name: file.name,
      size: file.size,
      type: file.type,
      lastModified: file.lastModified,
      constructor: file.constructor.name
    });

    // 使用 FileReader 替代 arrayBuffer() 来排查问题
    const buffer = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('FileReader failed'));
      reader.readAsArrayBuffer(file);
    });

    console.log('ArrayBuffer size:', buffer.byteLength);

    // 检查 buffer 的前几个字节
    const firstBytes = new Uint8Array(buffer.slice(0, 20));
    console.log('First 20 bytes:', Array.from(firstBytes).map(b => b.toString(16).padStart(2, '0')).join(' '));

    const info = await parseTorrent(buffer);
    const magnetUri = generateMagnetUri(info);
    return { success: true, fileName: file.name, magnetUri, infoHash: info.infoHash };
  } catch (e) {
    console.error('Error processing file:', file.name, e);
    console.error('Error stack:', e.stack);
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
