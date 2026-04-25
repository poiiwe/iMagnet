/**
 * Magnet URI 解析与生成模块
 */

const MAGNET_PREFIX = 'magnet:?';
const BTIH_PREFIX = 'urn:btih:';

/**
 * 解析 magnet URI
 * @param {string} uri
 * @returns {{ infoHash: string, name: string|null, trackers: string[] }}
 */
export function parseMagnetUri(uri) {
  const trimmed = uri.trim();

  if (!trimmed.toLowerCase().startsWith(MAGNET_PREFIX)) {
    throw new Error('无效的磁力链接：必须以 magnet:? 开头');
  }

  const params = new URLSearchParams(trimmed.slice(MAGNET_PREFIX.length));
  const xt = params.get('xt') || params.getAll('xt').find(x => x.toLowerCase().startsWith(BTIH_PREFIX));

  if (!xt) {
    throw new Error('无效的磁力链接：缺少 xt 参数（info hash）');
  }

  const xtLower = xt.toLowerCase();
  if (!xtLower.startsWith(BTIH_PREFIX)) {
    throw new Error('无效的磁力链接：xt 参数必须为 urn:btih: 格式');
  }

  let infoHash = xt.slice(BTIH_PREFIX.length);

  // 如果是 base32 格式，转换为十六进制
  if (infoHash.length === 32) {
    infoHash = base32ToHex(infoHash);
    if (!infoHash) {
      throw new Error('无效的磁力链接：info hash base32 解码失败');
    }
  }

  // 验证十六进制 info hash
  if (infoHash.length !== 40 || !/^[0-9a-f]{40}$/.test(infoHash)) {
    throw new Error('无效的磁力链接：info hash 必须为 40 位十六进制字符');
  }

  const name = params.get('dn') || null;
  const trackers = params.getAll('tr');

  return { infoHash, name, trackers };
}

/**
 * 根据 torrent 信息生成 magnet URI
 * @param {{ infoHash: string, name?: string|null, announce?: string|null, announceList?: string[][], trackers?: string[] }} torrentInfo
 * @param {{ includeName?: boolean, includeTrackers?: boolean }} [options]
 * @returns {string}
 */
export function generateMagnetUri(torrentInfo, { includeName = false, includeTrackers = false } = {}) {
  const parts = [`xt=${BTIH_PREFIX}${torrentInfo.infoHash}`];

  if (includeName && torrentInfo.name) {
    parts.push(`dn=${encodeURIComponent(torrentInfo.name)}`);
  }

  if (includeTrackers) {
    for (const tracker of collectTrackers(torrentInfo)) {
      parts.push(`tr=${encodeURIComponent(tracker)}`);
    }
  }

  return `magnet:?${parts.join('&')}`;
}

/**
 * 合并 announce / announceList / trackers 并按出现顺序去重
 * @param {{ announce?: string|null, announceList?: string[][], trackers?: string[] }} torrentInfo
 * @returns {string[]}
 */
export function collectTrackers(torrentInfo) {
  const set = new Set();
  if (torrentInfo.announce) {
    set.add(torrentInfo.announce);
  }
  if (torrentInfo.announceList) {
    for (const tier of torrentInfo.announceList) {
      for (const tracker of tier) {
        set.add(tracker);
      }
    }
  }
  if (torrentInfo.trackers) {
    for (const tracker of torrentInfo.trackers) {
      set.add(tracker);
    }
  }
  return Array.from(set);
}

/**
 * Base32 解码为十六进制字符串
 * @param {string} base32
 * @returns {string|null}
 */
function base32ToHex(base32) {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz234567';
  let bits = '';

  for (const char of base32.toLowerCase()) {
    const idx = alphabet.indexOf(char);
    if (idx === -1) return null;
    bits += idx.toString(2).padStart(5, '0');
  }

  let hex = '';
  for (let i = 0; i + 4 <= bits.length; i += 4) {
    hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
  }

  return hex;
}
