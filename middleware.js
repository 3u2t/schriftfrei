const BLOCKED_UA_SUBSTRINGS = [
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

export default function middleware(request) {
  const ua = (request.headers.get('user-agent') || '').toLowerCase();
  if (ua && BLOCKED_UA_SUBSTRINGS.some((s) => ua.includes(s))) {
    return new Response('Forbidden', { status: 403 });
  }
  return undefined;
}

export const config = {
  matcher: '/(.*)',
};
