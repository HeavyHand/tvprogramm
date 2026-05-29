#!/usr/bin/env node
/*
 * TV-CHECKPROGRAMM workflow bot
 * Lightweight CI helper: checks that the IPTV search sources are reachable and
 * prints a summary for GitHub Actions logs. The browser app owns matching logic.
 */

const sources = [
  ['zabava-project', 'https://raw.githubusercontent.com/CrocoUser/zabava-project/refs/heads/main/zabava-full.m3u'],
  ['livem3u', 'https://secure-272717.tatnet.app/livem3u.tatnet.app/data/playlist.m3u'],
  ['zabava-mirror', 'https://secure-272717.tatnet.app/livem3u.tatnet.app/zabava-full.m3u'],
];

function parseCount(text) {
  return text.split(/\r?\n/).filter(line => line.startsWith('#EXTINF')).length;
}

async function probe([id, url]) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const text = await fetchText(url, controller.signal);
    return { id, ok: true, count: parseCount(text), bytes: text.length };
  } catch (error) {
    return { id, ok: false, error: error.message };
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchText(url, signal) {
  try {
    const resp = await fetch(url, { signal });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return await resp.text();
  } catch (error) {
    // Some CI/container networks expose IPv4 only while undici may fail fast on
    // IPv6. Curl handles that environment more gracefully, so keep it as a
    // fallback for the workflow bot.
    return await curlText(url);
  }
}

async function curlText(url) {
  const { execFile } = await import('node:child_process');
  return await new Promise((resolve, reject) => {
    execFile('curl', ['-4', '-fsSL', '--max-time', '20', url], { maxBuffer: 25 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) reject(new Error((stderr || error.message).trim()));
      else resolve(stdout);
    });
  });
}

const results = await Promise.all(sources.map(probe));
console.table(results);

const healthy = results.filter(result => result.ok && result.count > 0).length;
if (healthy === 0) {
  console.error('No IPTV sources are healthy.');
  process.exit(1);
}

console.log(`Workflow bot: ${healthy}/${sources.length} IPTV sources are healthy.`);
