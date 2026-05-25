#!/usr/bin/env node

const DEFAULT_FRONTEND_URL = process.env.AURORA_FRONTEND_URL || 'https://www.pso-aurora.com';
const DEFAULT_BACKEND_URL = process.env.AURORA_BACKEND_URL || process.env.POCKETBASE_URL || process.env.VITE_POCKETBASE_URL || 'http://127.0.0.1:8090';
const DEFAULT_TIMEOUT_MS = Number(process.env.AURORA_HEALTH_TIMEOUT_MS || 12000);
const LANDING_CONFIG_KEY = 'aurora_landing_config';
const CENSUS_SURVEY_MASTERS_KEY = 'aurora_census_survey_masters';
const CENSUS_SURVEY_CYCLES_KEY = 'aurora_census_survey_cycles';

const args = process.argv.slice(2);

const readArg = (flag) => {
  const index = args.indexOf(flag);
  if (index === -1) return null;
  return args[index + 1] ?? null;
};

const normalizeBaseUrl = (value) => {
  const candidate = (value || '').trim();
  if (!candidate) {
    throw new Error('URL is empty.');
  }

  const withProtocol = /^https?:\/\//i.test(candidate) ? candidate : `https://${candidate}`;
  const url = new URL(withProtocol);
  return `${url.origin}${url.pathname}`.replace(/\/+$/, '');
};

const timeoutArg = readArg('--timeout-ms');
const timeoutMs = timeoutArg ? Number(timeoutArg) : DEFAULT_TIMEOUT_MS;
const frontendUrl = normalizeBaseUrl(readArg('--frontend') || DEFAULT_FRONTEND_URL);
const backendUrl = normalizeBaseUrl(readArg('--backend') || DEFAULT_BACKEND_URL);

if (!Number.isFinite(timeoutMs) || timeoutMs < 1000) {
  throw new Error(`Invalid timeout value: ${timeoutArg || DEFAULT_TIMEOUT_MS}`);
}

const checkResults = [];

const addResult = (status, name, message, details = []) => {
  checkResults.push({ status, name, message, details });
};

const fetchWithTimeout = async (url, options = {}, timeout = timeoutMs) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
      cache: 'no-store',
    });
  } finally {
    clearTimeout(timer);
  }
};

const resolveUrl = (base, path) => {
  const normalizedBase = base.endsWith('/') ? base : `${base}/`;
  return new URL(path, normalizedBase).toString();
};

const fetchPublicAppStateRecord = async (backendBaseUrl, key) => {
  const endpoint = resolveUrl(
    backendBaseUrl,
    `/api/collections/app_state/records?filter=${encodeURIComponent(`scope="global" && key="${key}"`)}&perPage=1&fields=id,value`,
  );
  const response = await fetchWithTimeout(endpoint, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    return { ok: false, status: response.status, record: null };
  }

  const payload = await response.json();
  return {
    ok: true,
    status: response.status,
    record: payload?.items?.[0] || null,
  };
};

const isPortableImageSource = (value) => {
  if (!value) return false;
  if (value.startsWith('data:image/')) return true;
  if (value.startsWith('/')) return true;
  if (/^https?:\/\//i.test(value)) return true;
  return false;
};

const isLikelyBrokenImageSource = (value) => {
  if (!value) return false;
  if (value.startsWith('blob:')) return true;
  if (value.startsWith('file:')) return true;
  if (/^https?:\/\/(localhost|127\.0\.0\.1)/i.test(value)) return true;
  if (/^[a-zA-Z]:\\/.test(value)) return true;
  return false;
};

const resolveImageCheckUrl = (source, { frontendUrl, backendUrl }) => {
  const value = String(source || '').trim();
  if (!value || value.startsWith('data:image/')) return '';
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith('/api/files/')) return resolveUrl(backendUrl, value);
  if (value.startsWith('api/files/')) return resolveUrl(backendUrl, `/${value}`);
  if (value.startsWith('/')) return resolveUrl(frontendUrl, value);
  return '';
};

const checkImageReachability = async (source, urls) => {
  const url = resolveImageCheckUrl(source, urls);
  if (!url) return { ok: true, skipped: true, status: 0, url: '' };

  const request = async (method) => fetchWithTimeout(url, {
    method,
    headers: {
      Accept: 'image/*,*/*',
      ...(method === 'GET' ? { Range: 'bytes=0-0' } : {}),
    },
    redirect: 'follow',
  });

  let response = await request('HEAD');
  if (response.status === 405) {
    response = await request('GET');
  }

  return {
    ok: response.ok,
    skipped: false,
    status: response.status,
    url,
    contentType: response.headers.get('content-type') || '',
  };
};

const main = async () => {
  console.log('Aurora Public Health Check');
  console.log(`- Frontend URL: ${frontendUrl}`);
  console.log(`- Backend URL: ${backendUrl}`);
  console.log(`- Timeout: ${timeoutMs}ms`);

  const context = {
    frontendHtml: '',
    frontendBundleUrl: '',
    landingRecord: null,
  };

  try {
    const response = await fetchWithTimeout(frontendUrl, {
      method: 'GET',
      headers: { Accept: 'text/html' },
      redirect: 'follow',
    });

    if (!response.ok) {
      addResult('fail', 'Frontend Reachability', `Frontend returned HTTP ${response.status}.`);
    } else {
      const html = await response.text();
      context.frontendHtml = html;
      const hasDevClient = html.includes('/@vite/client') || html.includes('/index.tsx');
      const hasProdBundle = /src=["'][^"']*\/assets\/index-[^"']+\.js["']/i.test(html);
      const moduleScriptMatch = html.match(/<script[^>]+type=["']module["'][^>]+src=["']([^"']+)["']/i);
      if (moduleScriptMatch?.[1]) {
        context.frontendBundleUrl = resolveUrl(frontendUrl, moduleScriptMatch[1]);
      }

      if (hasDevClient) {
        addResult('fail', 'Frontend Mode', 'Site is still serving Vite dev endpoints.', [
          'Deploy the latest production build.',
          'For local checks, run npm run build && npm run start:prod.',
        ]);
      } else if (!hasProdBundle) {
        addResult('warn', 'Frontend Bundle Detection', 'Could not detect a hashed production bundle in HTML source.');
      } else {
        addResult('pass', 'Frontend Mode', 'Frontend appears to be running a production build.');
      }
    }
  } catch (error) {
    addResult('fail', 'Frontend Reachability', `Unable to reach frontend (${error.message || 'network error'}).`);
  }

  if (context.frontendBundleUrl) {
    try {
      const bundleResponse = await fetchWithTimeout(context.frontendBundleUrl, {
        method: 'GET',
        headers: { Accept: 'application/javascript,text/javascript,*/*' },
      });
      if (!bundleResponse.ok) {
        addResult('warn', 'Bundle Fetch', `Unable to read frontend bundle (HTTP ${bundleResponse.status}).`);
      } else {
        const bundle = await bundleResponse.text();
        const configuredBackendOrigin = new URL(backendUrl).origin;
        const hasLocalFallback = bundle.includes('localhost:8090') || bundle.includes('127.0.0.1:8090');
        const hasConfiguredBackend = bundle.includes(configuredBackendOrigin);

        if (hasLocalFallback && !hasConfiguredBackend) {
          addResult('fail', 'Backend URL in Bundle', 'Frontend bundle still contains localhost PocketBase URL.');
        } else if (hasLocalFallback) {
          addResult('pass', 'Backend URL in Bundle', 'Frontend bundle contains the configured backend URL; localhost is only present as fallback code.');
        } else {
          addResult('pass', 'Backend URL in Bundle', 'Frontend bundle appears to target a non-local PocketBase URL.');
        }
      }
    } catch (error) {
      addResult('warn', 'Bundle Fetch', `Unable to read frontend bundle (${error.message || 'network error'}).`);
    }
  }

  try {
    const healthResponse = await fetchWithTimeout(resolveUrl(backendUrl, '/api/health'), {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    if (healthResponse.ok) {
      addResult('pass', 'Backend Reachability', 'PocketBase health endpoint is reachable.');
    } else {
      addResult('fail', 'Backend Reachability', `PocketBase health endpoint returned HTTP ${healthResponse.status}.`);
    }
  } catch (error) {
    addResult('fail', 'Backend Reachability', `Unable to reach PocketBase health endpoint (${error.message || 'network error'}).`);
  }

  try {
    const response = await fetchPublicAppStateRecord(backendUrl, LANDING_CONFIG_KEY);

    if (!response.ok) {
      addResult('fail', 'Public Landing Record', `Backend returned HTTP ${response.status} for public landing query.`, [
        'Run npm run pocketbase:bootstrap against the target PocketBase instance.',
        'Confirm app_state public list/view rules are applied.',
      ]);
    } else {
      context.landingRecord = response.record;

      if (!response.record) {
        addResult('fail', 'Public Landing Record', 'No public landing config record found.', [
          'Log in to Settings on the host device.',
          'Click Save Changes once in Portal Configuration.',
        ]);
      } else {
        addResult('pass', 'Public Landing Record', `Record found (id: ${response.record.id || 'unknown'}).`);
      }
    }
  } catch (error) {
    addResult('fail', 'Public Landing Record', `Unable to query public landing record (${error.message || 'network error'}).`);
  }

  try {
    const [mastersResponse, cyclesResponse] = await Promise.all([
      fetchPublicAppStateRecord(backendUrl, CENSUS_SURVEY_MASTERS_KEY),
      fetchPublicAppStateRecord(backendUrl, CENSUS_SURVEY_CYCLES_KEY),
    ]);

    if (!mastersResponse.ok || !cyclesResponse.ok) {
      const failingStatus = !mastersResponse.ok ? mastersResponse.status : cyclesResponse.status;
      addResult('fail', 'Public Census State', `Backend returned HTTP ${failingStatus} for public Census & Surveys query.`, [
        'Run the PocketBase bootstrap script and republish the data.',
      ]);
    } else if (!mastersResponse.record) {
      addResult('warn', 'Public Census State', 'Census & Surveys master catalog has not been published to backend yet.');
    } else if (!cyclesResponse.record) {
      addResult('warn', 'Public Census State', 'Census & Surveys cycles record is not published yet.');
    } else {
      addResult('pass', 'Public Census State', `Masters and cycles are publicly readable (records: ${mastersResponse.record.id || 'unknown'}, ${cyclesResponse.record.id || 'unknown'}).`);
    }
  } catch (error) {
    addResult('fail', 'Public Census State', `Unable to query Census & Surveys public records (${error.message || 'network error'}).`);
  }

  if (context.landingRecord) {
    const landingValue = context.landingRecord.value;

    if (!landingValue || typeof landingValue !== 'object') {
      addResult('fail', 'Landing Payload Format', 'Landing record value is not a valid object.');
    } else {
      const heroImage = typeof landingValue.hero?.backgroundImage === 'string' ? landingValue.hero.backgroundImage : '';
      const teamMembers = Array.isArray(landingValue.team?.members) ? landingValue.team.members : [];
      const teamImages = teamMembers
        .map((member) => (typeof member?.image === 'string' ? member.image : ''))
        .filter(Boolean);

      if (!heroImage) {
        addResult('warn', 'Hero Image', 'Hero background image is empty in public landing config.');
      } else if (isLikelyBrokenImageSource(heroImage)) {
        addResult('fail', 'Hero Image', `Hero image uses non-portable source: ${heroImage.slice(0, 90)}...`);
      } else if (!isPortableImageSource(heroImage)) {
        addResult('warn', 'Hero Image', `Hero image source format is uncommon: ${heroImage.slice(0, 90)}...`);
      } else {
        try {
          const imageCheck = await checkImageReachability(heroImage, { frontendUrl, backendUrl });
          if (!imageCheck.ok) {
            addResult('fail', 'Hero Image', `Hero image is not reachable (HTTP ${imageCheck.status}).`, [
              imageCheck.url,
            ]);
          } else {
            addResult('pass', 'Hero Image', imageCheck.skipped
              ? 'Hero image source looks portable.'
              : `Hero image is reachable (${imageCheck.contentType || 'unknown content type'}).`);
          }
        } catch (error) {
          addResult('fail', 'Hero Image', `Unable to fetch hero image (${error.message || 'network error'}).`);
        }
      }

      if (teamImages.length === 0) {
        addResult('warn', 'Team Images', 'No team images found in public landing config.');
      } else {
        const brokenTeamImage = teamImages.find((value) => isLikelyBrokenImageSource(value));
        if (brokenTeamImage) {
          addResult('fail', 'Team Images', `At least one team image uses non-portable source: ${brokenTeamImage.slice(0, 90)}...`);
        } else {
          const imageChecks = await Promise.allSettled(
            teamImages.map((image) => checkImageReachability(image, { frontendUrl, backendUrl })),
          );
          const failedImageIndex = imageChecks.findIndex((result) => (
            result.status === 'rejected' || !result.value.ok
          ));

          if (failedImageIndex >= 0) {
            const failed = imageChecks[failedImageIndex];
            const details = failed.status === 'fulfilled' && failed.value.url
              ? [failed.value.url]
              : [];
            const statusMessage = failed.status === 'fulfilled'
              ? `HTTP ${failed.value.status}`
              : (failed.reason?.message || 'network error');
            addResult('fail', 'Team Images', `Team image ${failedImageIndex + 1} is not reachable (${statusMessage}).`, details);
          } else {
            addResult('pass', 'Team Images', `${teamImages.length} team image source(s) are reachable.`);
          }
        }
      }
    }
  }

  console.log('\nCheck Results');
  for (const result of checkResults) {
    const symbol = result.status === 'pass' ? 'PASS' : result.status === 'warn' ? 'WARN' : 'FAIL';
    console.log(`- [${symbol}] ${result.name}: ${result.message}`);
    for (const detail of result.details) {
      console.log(`    - ${detail}`);
    }
  }

  const passCount = checkResults.filter((entry) => entry.status === 'pass').length;
  const warnCount = checkResults.filter((entry) => entry.status === 'warn').length;
  const failCount = checkResults.filter((entry) => entry.status === 'fail').length;

  console.log('\nSummary');
  console.log(`- Pass: ${passCount}`);
  console.log(`- Warn: ${warnCount}`);
  console.log(`- Fail: ${failCount}`);

  if (failCount > 0) {
    console.log('\nResult: FAILED - fix failing checks, then rerun this command.');
    process.exitCode = 1;
  } else {
    console.log('\nResult: OK - public deployment checks passed.');
  }
};

main().catch((error) => {
  console.error('Health check crashed:', error);
  process.exit(1);
});
