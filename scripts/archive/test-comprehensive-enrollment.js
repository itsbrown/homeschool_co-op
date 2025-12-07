
/**
 * Comprehensive Test Suite for AI Enrollment Assistant
 * Tests both backend API functionality and frontend UI interactions
 * Focuses on memory persistence and end-to-end enrollment flow
 */

import puppeteer from 'puppeteer';
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';

const BASE_URL = 'http://0.0.0.0:5000';
const TEST_TOKEN = 'eyJhbGciOiJIUzI1NiIsImtpZCI6Im5Gc1ErcklNWC84OG55SE8iLCJ0eXAiOiJKV1QifQ.eyJpc3MiOiJodHRwczovL21vaXZ3anVnbHd3ZnJocWVld2p1LnN1cGFiYXNlLmNvL2F1dGgvdjEiLCJzdWIiOiIxNjUyM2ViMC1iOGRiLTQ0YzAtYTg0Zi0wYjVlOTRlYTc4NTIiLCJhdWQiOiJhdXRoZW50aWNhdGVkIiwiZXhwIjoxNzUyODA4MDY1LCJpYXQiOjE3NTI4MDQ0NjUsImVtYWlsIjoicGFyZW50X3Rlc3RAZ21haWwuY29tIiwicGhvbmUiOiIiLCJhcHBfbWV0YWRhdGEiOnsicHJvdmlkZXIiOiJlbWFpbCIsInByb3ZpZGVycyI6WyJlbWFpbCJdfSwidXNlcl9tZXRhZGF0YSI6eyJlbWFpbCI6InBhcmVudF90ZXN0QGdtYWlsLmNvbSIsImVtYWlsX3ZlcmlmaWVkIjp0cnVlLCJwaG9uZV92ZXJpZmllZCI6ZmFsc2UsInN1YiI6IjE2NTIzZWIwLWI4ZGItNDRjMC1hODRmLTBiNWU5NGVhNzg1MiJ9LCJyb2xlIjoiYXV0aGVudGljYXRlZCIsImFhbCI6ImFhbDEiLCJhbXIiOlt7Im1ldGhvZCI6InBhc3N3b3JkIiwidGltZXN0YW1wIjoxNzUyNDQ3ODkyfV0sInNlc3Npb25faWQiOiIyNDFkMmM2Ny0wMjQwLTRmZTgtODQ5OS04ZTgxMTA0YTdiMjciLCJpc19hbm9ueW1vdXMiOmZhbHNlfQ.g17Yca9gB2_0xq5GKEEEkZJKRjgpNWpPqdbZLLe8-ro';

class ComprehensiveTestSuite {
  constructor() {
    this.browser = null;
    this.page = null;
    this.testResults = {
      backend: [],
      frontend: [],
      integration: [],
      memory: []
    };
  }

  async setup() {
    console.log('🚀 Setting up comprehensive test environment...');
    
    // Launch browser for UI tests
    this.browser = await puppeteer.launch({
      headless: false, // Set to true for CI/CD
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      defaultViewport: { width: 1200, height: 800 }
    });
    
    this.page = await this.browser.newPage();
    
    // Enable console logging from the page
    this.page.on('console', msg => {
      if (msg.type() === 'error') {
        console.log('🔴 Browser Error:', msg.text());
      }
    });
  }

  async cleanup() {
    if (this.browser) {
      await this.browser.close();
    }
  }

  // Backend API Tests
  async testBackendAPIs() {
    console.log('\n📡 Testing Backend APIs...');
    
    const apiTests = [
      {
        name: 'AI Status Check',
        endpoint: '/api/ai/status',
        method: 'GET'
      },
      {
        name: 'Children List',
        endpoint: '/api/children',
        method: 'GET'
      },
      {
        name: 'Programs List',
        endpoint: '/api/programs',
        method: 'GET'
      },
      {
        name: 'Enrollments List',
        endpoint: '/api/enrollments',
        method: 'GET'
      }
    ];

    for (const test of apiTests) {
      try {
        const response = await fetch(`${BASE_URL}${test.endpoint}`, {
          method: test.method,
          headers: {
            'Authorization': `Bearer ${TEST_TOKEN}`,
            'Content-Type': 'application/json'
          }
        });

        const data = await response.json();
        
        this.testResults.backend.push({
          test: test.name,
          status: response.status,
          success: response.ok,
          dataReceived: !!data,
          timestamp: new Date().toISOString()
        });

        console.log(`  ${response.ok ? '✅' : '❌'} ${test.name}: ${response.status}`);
        
      } catch (error) {
        this.testResults.backend.push({
          test: test.name,
          success: false,
          error: error.message,
          timestamp: new Date().toISOString()
        });
        console.log(`  ❌ ${test.name}: ${error.message}`);
      }
    }
  }

  // AI Enrollment Assistant Backend Tests
  async testAIEnrollmentBackend() {
    console.log('\n🤖 Testing AI Enrollment Assistant Backend...');
    
    const conversations = [
      {
        name: 'Initial Contact',
        message: 'I want to register my child for programs',
        expectedInResponse: ['child', 'register', 'information']
      },
      {
        name: 'Memory Test - Ask About Mary',
        message: 'Tell me about Mary Brown',
        expectedInResponse: ['Mary', 'enrolled', 'registered']
      },
      {
        name: 'New Child Registration',
        message: 'I want to register Sarah Johnson, age 7, grade 2, loves art and music',
        expectedInResponse: ['Sarah', 'information', 'register']
      }
    ];

    for (const conv of conversations) {
      try {
        const response = await fetch(`${BASE_URL}/api/ai/enrollment-assistant`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${TEST_TOKEN}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            message: conv.message,
            childrenIds: [],
            history: []
          })
        });

        const data = await response.json();
        
        const hasExpectedContent = conv.expectedInResponse.some(keyword => 
          data.message && data.message.toLowerCase().includes(keyword.toLowerCase())
        );

        this.testResults.backend.push({
          test: `AI Enrollment - ${conv.name}`,
          success: response.ok && hasExpectedContent,
          hasAction: !!data.action,
          responseLength: data.message ? data.message.length : 0,
          timestamp: new Date().toISOString()
        });

        console.log(`  ${response.ok && hasExpectedContent ? '✅' : '❌'} ${conv.name}`);
        console.log(`    Response: ${data.message?.substring(0, 100)}...`);
        if (data.action) {
          console.log(`    Action: ${data.action.type}`);
        }
        
      } catch (error) {
        this.testResults.backend.push({
          test: `AI Enrollment - ${conv.name}`,
          success: false,
          error: error.message,
          timestamp: new Date().toISOString()
        });
        console.log(`  ❌ ${conv.name}: ${error.message}`);
      }
    }
  }

  // Frontend UI Tests
  async testFrontendUI() {
    console.log('\n🖥️ Testing Frontend UI...');
    
    try {
      // Navigate to enrollment assistant
      console.log('  📍 Navigating to enrollment assistant...');
      await this.page.goto(`${BASE_URL}/enrollment-assistant`, { 
        waitUntil: 'networkidle0',
        timeout: 30000 
      });

      // Take screenshot
      await this.page.screenshot({ path: 'test-enrollment-assistant.png' });
      console.log('  📸 Screenshot saved: test-enrollment-assistant.png');

      // Test page load
      const title = await this.page.title();
      const hasEnrollmentHeader = await this.page.$eval('body', body => 
        body.textContent.includes('AI Enrollment Assistant')
      ).catch(() => false);

      this.testResults.frontend.push({
        test: 'Page Load',
        success: hasEnrollmentHeader,
        title: title,
        timestamp: new Date().toISOString()
      });

      console.log(`  ${hasEnrollmentHeader ? '✅' : '❌'} Page Load - Title: ${title}`);

      // Test chat interface existence
      const chatInput = await this.page.$('input[type="text"], textarea').catch(() => null);
      const sendButton = await this.page.$('button').catch(() => null);

      this.testResults.frontend.push({
        test: 'Chat Interface',
        success: !!(chatInput && sendButton),
        hasChatInput: !!chatInput,
        hasSendButton: !!sendButton,
        timestamp: new Date().toISOString()
      });

      console.log(`  ${(chatInput && sendButton) ? '✅' : '❌'} Chat Interface Present`);

      // Test authentication state
      const authState = await this.page.evaluate(() => {
        const logs = window.console._logs || [];
        return logs.some(log => log.includes('authenticated') || log.includes('parent_test@gmail.com'));
      }).catch(() => false);

      this.testResults.frontend.push({
        test: 'Authentication State',
        success: authState,
        timestamp: new Date().toISOString()
      });

      console.log(`  ${authState ? '✅' : '❌'} Authentication State`);

    } catch (error) {
      this.testResults.frontend.push({
        test: 'Frontend UI Test',
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      });
      console.log(`  ❌ Frontend UI Test Failed: ${error.message}`);
    }
  }

  // Test UI Interaction with Backend
  async testUIInteraction() {
    console.log('\n🔄 Testing UI-Backend Integration...');
    
    try {
      // Wait for page to be ready
      await this.page.waitForTimeout(2000);

      // Find and interact with chat input
      const chatInput = await this.page.$('input, textarea');
      if (chatInput) {
        console.log('  💬 Testing chat interaction...');
        
        // Type a message
        await chatInput.type('Hello, I need help with enrollment');
        await this.page.waitForTimeout(1000);

        // Find and click send button
        const sendButton = await this.page.$('button[type="submit"], button:contains("Send")');
        if (sendButton) {
          await sendButton.click();
          console.log('  📤 Message sent');

          // Wait for response
          await this.page.waitForTimeout(3000);
          
          // Check for AI response
          const pageContent = await this.page.content();
          const hasResponse = pageContent.includes('help') || pageContent.includes('enrollment');

          this.testResults.integration.push({
            test: 'Chat Interaction',
            success: hasResponse,
            messageSent: true,
            responseReceived: hasResponse,
            timestamp: new Date().toISOString()
          });

          console.log(`  ${hasResponse ? '✅' : '❌'} Chat Response Received`);
        } else {
          console.log('  ⚠️ Send button not found');
        }
      } else {
        console.log('  ⚠️ Chat input not found');
      }

    } catch (error) {
      this.testResults.integration.push({
        test: 'UI Interaction',
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      });
      console.log(`  ❌ UI Interaction Failed: ${error.message}`);
    }
  }

  // Test Memory Persistence
  async testMemoryPersistence() {
    console.log('\n🧠 Testing AI Memory Persistence...');
    
    try {
      // Test conversation history storage
      const historyResponse = await fetch(`${BASE_URL}/api/ai/enrollment-assistant`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${TEST_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: 'Remember that Mary Brown is my daughter',
          childrenIds: [],
          history: []
        })
      });

      const historyData = await historyResponse.json();

      // Follow up to test memory
      const memoryResponse = await fetch(`${BASE_URL}/api/ai/enrollment-assistant`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${TEST_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: 'What do you know about Mary?',
          childrenIds: [],
          history: [
            { role: 'user', content: 'Remember that Mary Brown is my daughter' },
            { role: 'assistant', content: historyData.message }
          ]
        })
      });

      const memoryData = await memoryResponse.json();
      const remembersContext = memoryData.message.toLowerCase().includes('mary');

      this.testResults.memory.push({
        test: 'Conversation Memory',
        success: remembersContext,
        firstResponseReceived: !!historyData.message,
        contextRetained: remembersContext,
        timestamp: new Date().toISOString()
      });

      console.log(`  ${remembersContext ? '✅' : '❌'} Conversation Memory Test`);
      console.log(`    Memory response: ${memoryData.message?.substring(0, 100)}...`);

    } catch (error) {
      this.testResults.memory.push({
        test: 'Memory Persistence',
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      });
      console.log(`  ❌ Memory Persistence Failed: ${error.message}`);
    }
  }

  // Generate comprehensive report
  generateReport() {
    console.log('\n📊 COMPREHENSIVE TEST REPORT');
    console.log('=' .repeat(50));

    const categories = [
      { name: 'Backend APIs', tests: this.testResults.backend },
      { name: 'Frontend UI', tests: this.testResults.frontend },
      { name: 'Integration', tests: this.testResults.integration },
      { name: 'Memory Persistence', tests: this.testResults.memory }
    ];

    let totalTests = 0;
    let passedTests = 0;

    categories.forEach(category => {
      console.log(`\n${category.name}:`);
      category.tests.forEach(test => {
        totalTests++;
        if (test.success) passedTests++;
        console.log(`  ${test.success ? '✅' : '❌'} ${test.test}`);
        if (test.error) {
          console.log(`    Error: ${test.error}`);
        }
      });
    });

    console.log(`\n📈 SUMMARY:`);
    console.log(`  Total Tests: ${totalTests}`);
    console.log(`  Passed: ${passedTests}`);
    console.log(`  Failed: ${totalTests - passedTests}`);
    console.log(`  Success Rate: ${((passedTests / totalTests) * 100).toFixed(1)}%`);

    // Save detailed report
    const report = {
      summary: {
        totalTests,
        passedTests,
        failedTests: totalTests - passedTests,
        successRate: ((passedTests / totalTests) * 100).toFixed(1) + '%',
        timestamp: new Date().toISOString()
      },
      results: this.testResults
    };

    fs.writeFileSync('comprehensive-test-report.json', JSON.stringify(report, null, 2));
    console.log('\n💾 Detailed report saved to: comprehensive-test-report.json');

    return report;
  }

  // Main test runner
  async runAllTests() {
    try {
      await this.setup();
      
      await this.testBackendAPIs();
      await this.testAIEnrollmentBackend();
      await this.testFrontendUI();
      await this.testUIInteraction();
      await this.testMemoryPersistence();
      
      const report = this.generateReport();
      
      return report;
      
    } catch (error) {
      console.error('🔥 Test suite failed:', error);
      throw error;
    } finally {
      await this.cleanup();
    }
  }
}

// Run the comprehensive test suite
async function runComprehensiveTests() {
  console.log('🧪 Starting Comprehensive Test Suite for AI Enrollment Assistant');
  console.log('Testing: Backend APIs, Frontend UI, Integration, and Memory Persistence');
  console.log('=' .repeat(70));

  const testSuite = new ComprehensiveTestSuite();
  
  try {
    const report = await testSuite.runAllTests();
    
    if (report.summary.successRate === '100.0%') {
      console.log('\n🎉 ALL TESTS PASSED! System is fully functional.');
    } else {
      console.log('\n⚠️ Some tests failed. Please review the report for details.');
    }
    
    return report;
    
  } catch (error) {
    console.error('\n💥 Test suite execution failed:', error);
    process.exit(1);
  }
}

// Export for use in other scripts
export { ComprehensiveTestSuite, runComprehensiveTests };

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runComprehensiveTests();
}
