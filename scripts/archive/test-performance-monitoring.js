
/**
 * Performance Monitoring Test
 * Monitors system performance during enrollment operations
 */

import fetch from 'node-fetch';

const BASE_URL = 'http://0.0.0.0:5000';
const TEST_TOKEN = 'eyJhbGciOiJIUzI1NiIsImtpZCI6Im5Gc1ErcklNWC84OG55SE8iLCJ0eXAiOiJKV1QifQ.eyJpc3MiOiJodHRwczovL21vaXZ3anVnbHd3ZnJocWVld2p1LnN1cGFiYXNlLmNvL2F1dGgvdjEiLCJzdWIiOiIxNjUyM2ViMC1iOGRiLTQ0YzAtYTg0Zi0wYjVlOTRlYTc4NTIiLCJhdWQiOiJhdXRoZW50aWNhdGVkIiwiZXhwIjoxNzUyODA4MDY1LCJpYXQiOjE3NTI4MDQ0NjUsImVtYWlsIjoicGFyZW50X3Rlc3RAZ21haWwuY29tIiwicGhvbmUiOiIiLCJhcHBfbWV0YWRhdGEiOnsicHJvdmlkZXIiOiJlbWFpbCIsInByb3ZpZGVycyI6WyJlbWFpbCJdfSwidXNlcl9tZXRhZGF0YSI6eyJlbWFpbCI6InBhcmVudF90ZXN0QGdtYWlsLmNvbSIsImVtYWlsX3ZlcmlmaWVkIjp0cnVlLCJwaG9uZV92ZXJpZmllZCI6ZmFsc2UsInN1YiI6IjE2NTIzZWIwLWI4ZGItNDRjMC1hODRmLTBiNWU5NGVhNzg1MiJ9LCJyb2xlIjoiYXV0aGVudGljYXRlZCIsImFhbCI6ImFhbDEiLCJhbXIiOlt7Im1ldGhvZCI6InBhc3N3b3JkIiwidGltZXN0YW1wIjoxNzUyNDQ3ODkyfV0sInNlc3Npb25faWQiOiIyNDFkMmM2Ny0wMjQwLTRmZTgtODQ5OS04ZTgxMTA0YTdiMjciLCJpc19hbm9ueW1vdXMiOmZhbHNlfQ.g17Yca9gB2_0xq5GKEEEkZJKRjgpNWpPqdbZLLe8-ro';

async function measureEndpointPerformance(endpoint, method = 'GET', body = null) {
  const startTime = Date.now();
  
  try {
    const response = await fetch(`${BASE_URL}${endpoint}`, {
      method,
      headers: {
        'Authorization': `Bearer ${TEST_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: body ? JSON.stringify(body) : null
    });
    
    const endTime = Date.now();
    const responseTime = endTime - startTime;
    const data = await response.json();
    
    return {
      endpoint,
      success: response.ok,
      status: response.status,
      responseTime,
      dataSize: JSON.stringify(data).length,
      timestamp: new Date().toISOString()
    };
    
  } catch (error) {
    const endTime = Date.now();
    return {
      endpoint,
      success: false,
      error: error.message,
      responseTime: endTime - startTime,
      timestamp: new Date().toISOString()
    };
  }
}

async function runPerformanceTests() {
  console.log('⚡ Running Performance Tests...\n');
  
  const tests = [
    { endpoint: '/api/ai/status', name: 'AI Status' },
    { endpoint: '/api/children', name: 'Children List' },
    { endpoint: '/api/programs', name: 'Programs List' },
    { endpoint: '/api/enrollments', name: 'Enrollments List' },
    { 
      endpoint: '/api/ai/enrollment-assistant', 
      name: 'AI Enrollment',
      method: 'POST',
      body: { message: 'Hello', childrenIds: [], history: [] }
    }
  ];
  
  const results = [];
  
  for (const test of tests) {
    console.log(`Testing ${test.name}...`);
    const result = await measureEndpointPerformance(
      test.endpoint, 
      test.method || 'GET', 
      test.body
    );
    results.push(result);
    
    console.log(`  ${result.success ? '✅' : '❌'} ${result.responseTime}ms`);
  }
  
  // Performance analysis
  console.log('\n📊 Performance Analysis:');
  const avgResponseTime = results.reduce((sum, r) => sum + r.responseTime, 0) / results.length;
  const slowestEndpoint = results.reduce((prev, current) => 
    (prev.responseTime > current.responseTime) ? prev : current
  );
  
  console.log(`  Average Response Time: ${avgResponseTime.toFixed(2)}ms`);
  console.log(`  Slowest Endpoint: ${slowestEndpoint.endpoint} (${slowestEndpoint.responseTime}ms)`);
  
  // Flag performance issues
  const slowEndpoints = results.filter(r => r.responseTime > 2000);
  if (slowEndpoints.length > 0) {
    console.log('\n⚠️ Slow Endpoints (>2s):');
    slowEndpoints.forEach(endpoint => {
      console.log(`  ${endpoint.endpoint}: ${endpoint.responseTime}ms`);
    });
  } else {
    console.log('\n✅ All endpoints performing well (<2s)');
  }
  
  return results;
}

runPerformanceTests().catch(console.error);
