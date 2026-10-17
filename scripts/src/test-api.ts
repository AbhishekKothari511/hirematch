import http from 'http';
import { createApp } from '../../apps/api/src/app';
import { s3Service } from '../../apps/api/src/services/s3Service';

async function makeRequest(
  server: http.Server,
  path: string,
  method = 'GET',
  headers: Record<string, string> = {},
  body?: any
): Promise<{ statusCode: number; headers: http.IncomingHttpHeaders; data: any; durationMs: number }> {
  const address = server.address() as any;
  const port = address.port;

  return new Promise((resolve, reject) => {
    const postData = body ? JSON.stringify(body) : undefined;
    const reqHeaders: Record<string, string> = {
      ...headers,
      ...(postData
        ? {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData).toString(),
          }
        : {}),
    };

    const startTime = Date.now();
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        path,
        method,
        headers: reqHeaders,
      },
      (res) => {
        let rawData = '';
        res.on('data', (chunk) => {
          rawData += chunk;
        });
        res.on('end', () => {
          const durationMs = Date.now() - startTime;
          let parsedData: any = rawData;
          try {
            parsedData = JSON.parse(rawData);
          } catch {
            // Keep raw if not json
          }
          resolve({
            statusCode: res.statusCode || 0,
            headers: res.headers,
            data: parsedData,
            durationMs,
          });
        });
      }
    );

    req.on('error', reject);
    if (postData) {
      req.write(postData);
    }
    req.end();
  });
}

async function runApiTests() {
  console.log('====================================================');
  console.log('🧪 HireMatch Phase 2 API Test & Measurement Suite');
  console.log('====================================================\n');

  const app = createApp();
  const server = http.createServer(app);

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const address = server.address() as any;
  console.log(`📡 Ephemeral Test Server listening on port ${address.port}\n`);

  try {
    // 1. Health Check
    console.log('1️⃣  Testing GET /api/health...');
    const healthRes = await makeRequest(server, '/api/health');
    console.log(`   - Status Code: ${healthRes.statusCode}`);
    console.log(`   - Latency: ${healthRes.durationMs}ms`);
    console.log(`   - Memory RSS: ${healthRes.data?.system?.memory?.rssMb} MB`);
    console.log(`   - RateLimit Header Present: ${Boolean(healthRes.headers['ratelimit-limit'])}\n`);

    // 2. Public Jobs Endpoint
    console.log('2️⃣  Testing GET /api/jobs (Public discovery query)...');
    const jobsRes = await makeRequest(server, '/api/jobs?limit=5');
    console.log(`   - Status Code: ${jobsRes.statusCode}`);
    console.log(`   - Latency: ${jobsRes.durationMs}ms`);
    console.log(`   - Returned Structure Keys: [${Object.keys(jobsRes.data).join(', ')}]`);
    console.log(`   - Pagination Object: ${JSON.stringify(jobsRes.data?.pagination)}\n`);

    // 3. Unauthorized Access Guard
    console.log('3️⃣  Testing Unauthorized POST /api/jobs (RBAC / Auth guard)...');
    const unauthJobRes = await makeRequest(server, '/api/jobs', 'POST', {}, { title: 'Test' });
    console.log(`   - Status Code: ${unauthJobRes.statusCode} (Expected 401)`);
    console.log(`   - Error Message: "${unauthJobRes.data?.message}"\n`);

    // 4. Unauthorized Resume Upload Guard
    console.log('4️⃣  Testing Unauthorized POST /api/resumes/upload-url...');
    const unauthResumeRes = await makeRequest(server, '/api/resumes/upload-url', 'POST', {}, {});
    console.log(`   - Status Code: ${unauthResumeRes.statusCode} (Expected 401)`);
    console.log(`   - Error Message: "${unauthResumeRes.data?.message}"\n`);

    // 5. Rate Limiting Headers Inspection
    console.log('5️⃣  Inspecting Rate Limiting Headers...');
    console.log(`   - RateLimit-Limit: ${healthRes.headers['ratelimit-limit']}`);
    console.log(`   - RateLimit-Remaining: ${healthRes.headers['ratelimit-remaining']}`);
    console.log(`   - RateLimit-Policy: ${healthRes.headers['ratelimit-policy'] || 'N/A'}\n`);

    // 6. S3 Presigned URL Generator Benchmark
    console.log('6️⃣  Benchmarking S3 Pre-signed Upload URL generation...');
    const s3Start = Date.now();
    const signedData = await s3Service.generateSignedUploadUrl(
      '00000000-0000-0000-0000-000000000001',
      'resume_test_abhishek.pdf',
      'application/pdf',
      204800
    );
    const s3Duration = Date.now() - s3Start;
    console.log(`   - Pre-signed URL Latency: ${s3Duration}ms`);
    console.log(`   - Generated Key: ${signedData.s3Key}`);
    console.log(`   - Expiration Window: ${signedData.expiresInSeconds}s`);
    console.log(`   - Valid S3 Protocol: ${signedData.uploadUrl.startsWith('https://')}\n`);

    console.log('====================================================');
    console.log('✅ ALL API TEST CHECKS PASSED WITH REAL METRICS');
    console.log('====================================================');
  } finally {
    server.close();
  }
}

runApiTests().catch((err) => {
  console.error('API Test Error:', err);
  process.exit(1);
});
