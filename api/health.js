const GIF_1PX = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64'
);

const BLOCKED_UA = [
  'headlesschrome',
  'phantomjs',
  'selenium',
  'curl',
  'wget',
  'python-requests',
  'python-urllib',
  'go-http-client',
  'libwww-perl',
  'scrapy',
  'httpclient',
  'sqlmap',
  'nikto',
  'masscan',
  'nmap',
  'zgrab',
];

const recentIps = new Map();

function prune(now) {
  if (recentIps.size <= 1000) return;
  const cutoff = now - 60000;
  for (const [k, v] of recentIps) {
    if (v < cutoff) recentIps.delete(k);
  }
}

function detectOS(ua) {
  if (/Windows NT 10[._]0/.test(ua)) return 'Windows 10/11';
  if (/Windows NT 6[._]3/.test(ua)) return 'Windows 8.1';
  if (/Windows NT 6[._]2/.test(ua)) return 'Windows 8';
  if (/Windows NT 6[._]1/.test(ua)) return 'Windows 7';
  if (/CrOS/.test(ua)) return 'ChromeOS';
  if (/iPhone|iPad|iPod/.test(ua)) {
    const m = ua.match(/CPU(?: iPhone)? OS (\d+[._]\d+)/);
    return m ? `iOS ${m[1].replace('_', '.')}` : 'iOS';
  }
  if (/Android/.test(ua)) {
    const m = ua.match(/Android (\d+[._]\d+)/);
    return m ? `Android ${m[1].replace('_', '.')}` : 'Android';
  }
  if (/Mac OS X/.test(ua)) {
    const m = ua.match(/Mac OS X (\d+[._]\d+)/);
    return m ? `macOS ${m[1].replace('_', '.')}` : 'macOS';
  }
  if (/Linux/.test(ua)) return 'Linux';
  return 'Unknown';
}

function detectBrowser(ua) {
  const edg = ua.match(/Edg\/(\d+)/);
  if (edg) return `Edge ${edg[1]}`;
  const opr = ua.match(/OPR\/(\d+)/);
  if (opr) return `Opera ${opr[1]}`;
  const chrome = ua.match(/Chrome\/(\d+)/);
  if (chrome) return `Chrome ${chrome[1]}`;
  const ff = ua.match(/Firefox\/(\d+)/);
  if (ff) return `Firefox ${ff[1]}`;
  const safari = ua.match(/Version\/(\d+)/);
  if (/Safari\//.test(ua) && safari) return `Safari ${safari[1]}`;
  return 'Unknown';
}

async function lookupGeo(ip) {
  try {
    const res = await fetch(
      `http://ip-api.com/json/${ip}?fields=status,country,regionName,city,isp,org,query`,
      { signal: AbortSignal.timeout(4000) }
    );
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'image/gif');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  const sendGif = () => res.status(200).send(GIF_1PX);

  const ua = req.headers['user-agent'] ?? '';
  const lower = ua.toLowerCase();
  if (lower && BLOCKED_UA.some((s) => lower.includes(s))) {
    return res.status(403).send('Forbidden');
  }

  const forwarded = req.headers['x-forwarded-for'];
  const ip =
    (typeof forwarded === 'string' ? forwarded.split(',')[0]?.trim() : '') ||
    req.headers['x-real-ip'] ||
    'unknown';

  const now = Date.now();
  const last = recentIps.get(ip);
  if (last && now - last < 60000) return sendGif();
  recentIps.set(ip, now);
  prune(now);

  const webhook = process.env.DISCORD_WEBHOOK_URL;
  if (webhook && ip !== 'unknown' && ip !== '127.0.0.1' && ip !== '::1') {
    const geo = await lookupGeo(ip);
    const ok = geo?.status === 'success';
    const loc = ok
      ? [geo?.city, geo?.regionName, geo?.country].filter(Boolean).join(', ')
      : 'Unknown';
    const isp = ok ? geo?.isp || geo?.org || 'Unknown' : 'Unknown';
    let path = '/';
    try {
      path = new URL(req.url, 'http://localhost').pathname;
    } catch {
      path = '/api/health';
    }

    const embed = {
      embeds: [
        {
          title: 'Site Visit',
          color: 0x34d399,
          fields: [
            { name: 'IP', value: ip, inline: true },
            { name: 'ISP', value: isp, inline: true },
            { name: 'Location', value: loc || 'Unknown', inline: true },
            { name: 'OS', value: detectOS(ua), inline: true },
            { name: 'Browser', value: detectBrowser(ua), inline: true },
            {
              name: 'Referer',
              value: req.headers.referer || req.headers.referrer || 'Direct',
              inline: true,
            },
            { name: 'Path', value: path, inline: true },
            { name: 'Timestamp', value: new Date().toISOString(), inline: false },
          ],
          footer: { text: 'schriftfrei' },
        },
      ],
    };

    await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(embed),
      signal: AbortSignal.timeout(5000),
    }).catch(() => undefined);
  }

  return sendGif();
}
