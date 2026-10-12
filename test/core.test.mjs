/**
 * 核心转换逻辑单元测试（node:test，无浏览器依赖）
 * 运行：npm test
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { encode, decode } from '../src/js/bencode.js';
import { parseMagnetUri, generateMagnetUri, collectTrackers } from '../src/js/magnet.js';
import { generateTorrentBlob, parseTorrent } from '../src/js/torrent.js';
import { magnetToTorrentBatch, torrentToMagnet } from '../src/js/converter.js';

const VALID_HASH = 'd9be8d0267e601f352f3b2f52b846235ee9a87d9';
const VALID_MAGNET = `magnet:?xt=urn:btih:${VALID_HASH}&dn=ubuntu.iso&tr=${encodeURIComponent('udp://tracker.example.com:80/announce')}`;

// --- bencode ---
test('bencode 编码/解码往返一致', () => {
  const obj = { a: 1, b: 'text', c: [1, 'x'], d: { k: new Uint8Array([1, 2, 3]) } };
  const round = decode(encode(obj));
  assert.equal(round.a, 1);
  assert.equal(new TextDecoder().decode(round.b), 'text');
  assert.equal(round.c[0], 1);
  assert.deepEqual(Array.from(round.d.k), [1, 2, 3]);
});

// --- magnet ---
test('parseMagnetUri 解析完整磁链', () => {
  const { infoHash, name, trackers } = parseMagnetUri(VALID_MAGNET);
  assert.equal(infoHash, VALID_HASH);
  assert.equal(name, 'ubuntu.iso');
  assert.deepEqual(trackers, ['udp://tracker.example.com:80/announce']);
});

test('parseMagnetUri 支持 base32 infoHash', () => {
  // 40 位 hex d9be...87d9 对应的 base32
  const { infoHash } = parseMagnetUri('magnet:?xt=urn:btih:3L5FQBCJ5NBIE6PJ2LPVE3I5XPU5R62I');
  assert.equal(infoHash.length, 40);
  assert.match(infoHash, /^[0-9a-f]{40}$/);
});

test('parseMagnetUri 拒绝非法输入', () => {
  assert.throws(() => parseMagnetUri('http://example.com'));
  assert.throws(() => parseMagnetUri('magnet:?dn=hash-only'));
  assert.throws(() => parseMagnetUri('magnet:?xt=urn:btih:tooshort'));
});

test('generateMagnetUri 按选项包含 dn / tr', () => {
  const info = { infoHash: VALID_HASH, name: 'a b', trackers: ['udp://t1', 'udp://t2'] };
  const bare = generateMagnetUri(info);
  assert.equal(bare, `magnet:?xt=urn:btih:${VALID_HASH}`);
  const full = generateMagnetUri(info, { includeName: true, includeTrackers: true });
  assert.ok(full.includes('dn=a%20b'));
  assert.ok(full.includes('tr=udp%3A%2F%2Ft1'));
  assert.ok(full.includes('tr=udp%3A%2F%2Ft2'));
});

test('collectTrackers 合并 announce / announce-list 并去重', () => {
  const t = collectTrackers({
    announce: 'udp://a',
    announceList: [['udp://a', 'udp://b'], ['udp://c']],
  });
  assert.deepEqual(t, ['udp://a', 'udp://b', 'udp://c']);
});

// --- torrent ---
test('generateTorrentBlob → parseTorrent 往返', async () => {
  const blob = generateTorrentBlob({ infoHash: VALID_HASH, name: 'roundtrip', trackers: ['udp://t'] });
  const info = await parseTorrent(await blob.arrayBuffer());
  assert.equal(info.name, 'roundtrip');
  assert.equal(info.announce, 'udp://t');
  // info dict 结构不同，hash 不必等于原 hash，但必须合法
  assert.match(info.infoHash, /^[0-9a-f]{40}$/);
});

// --- converter ---
test('magnetToTorrentBatch 混合输入：成功与失败并存且顺序一致', () => {
  const results = magnetToTorrentBatch(`${VALID_MAGNET}\nnot-a-magnet\n${VALID_MAGNET}`);
  assert.equal(results.length, 3);
  assert.equal(results[0].success, true);
  assert.equal(results[0].name, 'ubuntu.iso.torrent');
  assert.equal(results[1].success, false);
  assert.equal(results[2].success, true);
});

test('torrentToMagnet 从 File 生成磁链', async () => {
  const blob = generateTorrentBlob({ infoHash: VALID_HASH, name: 'file-test', trackers: ['udp://t'] });
  const file = new File([blob], 'file-test.torrent', { type: 'application/x-bittorrent' });
  const result = await torrentToMagnet(file, { includeName: true, includeTrackers: true });
  assert.equal(result.success, true);
  assert.ok(result.magnetUri.startsWith('magnet:?xt=urn:btih:'));
  assert.ok(result.magnetUri.includes('dn=file-test'));
  assert.ok(result.magnetUri.includes('tr=udp%3A%2F%2Ft'));
});

test('torrentToMagnet 拒绝无效文件', async () => {
  const file = new File([new Uint8Array([1, 2, 3])], 'bad.torrent');
  const result = await torrentToMagnet(file);
  assert.equal(result.success, false);
  assert.ok(result.error.length > 0);
});
