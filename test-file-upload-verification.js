
/**
 * Comprehensive File Upload Verification Test
 * Tests both backend API and frontend UI functionality
 */

import puppeteer from 'puppeteer';
import fetch from 'node-fetch';
import FormData from 'form-data';
import fs from 'fs';
import path from 'path';

const BASE_URL = 'http://0.0.0.0:5000';

class FileUploadVerificationTest {
  constructor() {
    this.browser = null;
    this.page = null;
    this.testResults = {
      backend: [],
      frontend: [],
      integration: []
    };
  }

  async setup() {
    console.log('🚀 Setting up file upload verification test...');
    
    // Create test file if it doesn't exist
    const testFilePath = path.join(process.cwd(), 'test-upload-verification.txt');
    if (!fs.existsSync(testFilePath)) {
      fs.writeFileSync(testFilePath, 'This is a test file for upload verification.\nContent: Hello World!\nTimestamp: ' + new Date().toISOString());
    }

    // Launch browser for UI tests
    this.browser = await puppeteer.launch({
      headless: false,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      defaultViewport: { width: 1200, height: 800 }
    });
    
    this.page = await this.browser.newPage();
    
    // Enable console logging
    this.page.on('console', msg => {
      console.log('🖥️ Browser:', msg.text());
    });

    // Enable request logging
    this.page.on('request', request => {
      if (request.url().includes('/api/file-upload')) {
        console.log('📤 Upload Request:', request.url(), request.method());
      }
    });

    this.page.on('response', response => {
      if (response.url().includes('/api/file-upload')) {
        console.log('📥 Upload Response:', response.url(), response.status());
      }
    });
  }

  async cleanup() {
    if (this.browser) {
      await this.browser.close();
    }
    
    // Clean up test file
    const testFilePath = path.join(process.cwd(), 'test-upload-verification.txt');
    if (fs.existsSync(testFilePath)) {
      fs.unlinkSync(testFilePath);
    }
  }

  // Test Backend API directly
  async testBackendAPI() {
    console.log('\n📡 Testing Backend File Upload API...');
    
    try {
      // Test file upload endpoint
      const testFilePath = path.join(process.cwd(), 'test-upload-verification.txt');
      const formData = new FormData();
      formData.append('files', fs.createReadStream(testFilePath));

      console.log('  📤 Sending file to /api/file-upload/knowledge-base...');
      const response = await fetch(`${BASE_URL}/api/file-upload/knowledge-base`, {
        method: 'POST',
        body: formData,
      });

      const responseText = await response.text();
      let data;
      try {
        data = JSON.parse(responseText);
      } catch (e) {
        data = { rawResponse: responseText };
      }

      this.testResults.backend.push({
        test: 'Backend File Upload API',
        success: response.ok,
        status: response.status,
        data: data,
        timestamp: new Date().toISOString()
      });

      console.log(`  ${response.ok ? '✅' : '❌'} Backend API - Status: ${response.status}`);
      console.log(`  📄 Response:`, JSON.stringify(data, null, 2));

      // Test file retrieval if upload was successful
      if (response.ok && data.files && data.files.length > 0) {
        const fileUrl = data.files[0].url;
        console.log(`  🔍 Testing file retrieval: ${fileUrl}`);
        
        const fileResponse = await fetch(`${BASE_URL}${fileUrl}`);
        
        this.testResults.backend.push({
          test: 'Backend File Retrieval',
          success: fileResponse.ok,
          status: fileResponse.status,
          fileUrl: fileUrl,
          timestamp: new Date().toISOString()
        });

        console.log(`  ${fileResponse.ok ? '✅' : '❌'} File Retrieval - Status: ${fileResponse.status}`);
      }

    } catch (error) {
      this.testResults.backend.push({
        test: 'Backend File Upload API',
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      });
      console.log(`  ❌ Backend API Error: ${error.message}`);
    }
  }

  // Test Frontend UI
  async testFrontendUI() {
    console.log('\n🖥️ Testing Frontend File Upload UI...');
    
    try {
      // Navigate to knowledge base page
      console.log('  📍 Navigating to knowledge base page...');
      await this.page.goto(`${BASE_URL}/knowledge-base`, { 
        waitUntil: 'networkidle0',
        timeout: 30000 
      });

      // Take screenshot
      await this.page.screenshot({ path: 'test-file-upload-page.png' });

      // Look for create button
      console.log('  🔍 Looking for Create New button...');
      const createButton = await this.page.$('#create-knowledge-base-button, button:contains("Create New")').catch(() => null);
      
      this.testResults.frontend.push({
        test: 'Create Button Presence',
        success: !!createButton,
        timestamp: new Date().toISOString()
      });

      console.log(`  ${createButton ? '✅' : '❌'} Create New Button Found`);

      if (createButton) {
        console.log('  👆 Clicking Create New button...');
        await createButton.click();
        await this.page.waitForTimeout(2000);

        // Look for file upload modal
        console.log('  🔍 Looking for file upload interface...');
        const uploadModal = await this.page.$('[role="dialog"], .dialog, .modal').catch(() => null);
        const fileInput = await this.page.$('input[type="file"]').catch(() => null);

        this.testResults.frontend.push({
          test: 'Upload Modal/Interface',
          success: !!(uploadModal || fileInput),
          hasModal: !!uploadModal,
          hasFileInput: !!fileInput,
          timestamp: new Date().toISOString()
        });

        console.log(`  ${(uploadModal || fileInput) ? '✅' : '❌'} Upload Interface Found`);

        // Test file selection if input exists
        if (fileInput) {
          console.log('  📁 Testing file selection...');
          const testFilePath = path.join(process.cwd(), 'test-upload-verification.txt');
          
          try {
            await fileInput.uploadFile(testFilePath);
            console.log('  ✅ File selected successfully');
            
            // Look for upload button
            const uploadButton = await this.page.$('button:contains("Upload"), button:contains("Create")').catch(() => null);
            if (uploadButton) {
              console.log('  👆 Clicking upload button...');
              await uploadButton.click();
              
              // Wait for upload to complete
              await this.page.waitForTimeout(5000);
              
              // Check for success indicators
              const successIndicator = await this.page.$('.toast, .success, .complete').catch(() => null);
              const errorIndicator = await this.page.$('.error, .failed').catch(() => null);
              
              this.testResults.frontend.push({
                test: 'File Upload Completion',
                success: !!successIndicator && !errorIndicator,
                hasSuccess: !!successIndicator,
                hasError: !!errorIndicator,
                timestamp: new Date().toISOString()
              });

              console.log(`  ${successIndicator && !errorIndicator ? '✅' : '❌'} Upload Completion`);
            }
          } catch (error) {
            console.log(`  ❌ File upload error: ${error.message}`);
            this.testResults.frontend.push({
              test: 'File Upload Process',
              success: false,
              error: error.message,
              timestamp: new Date().toISOString()
            });
          }
        }
      }

      // Take final screenshot
      await this.page.screenshot({ path: 'test-file-upload-result.png' });

    } catch (error) {
      this.testResults.frontend.push({
        test: 'Frontend UI Test',
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      });
      console.log(`  ❌ Frontend UI Error: ${error.message}`);
    }
  }

  // Test Integration
  async testIntegration() {
    console.log('\n🔗 Testing Upload Integration...');
    
    try {
      // Check uploads directory
      const uploadsDir = path.join(process.cwd(), 'uploads');
      const uploadsExists = fs.existsSync(uploadsDir);
      
      this.testResults.integration.push({
        test: 'Uploads Directory',
        success: uploadsExists,
        path: uploadsDir,
        timestamp: new Date().toISOString()
      });

      console.log(`  ${uploadsExists ? '✅' : '❌'} Uploads Directory Exists: ${uploadsDir}`);

      if (uploadsExists) {
        const files = fs.readdirSync(uploadsDir);
        const hasUploadedFiles = files.length > 0;
        
        console.log(`  📁 Files in uploads directory: ${files.length}`);
        console.log(`  📄 Files: ${files.slice(0, 5).join(', ')}${files.length > 5 ? '...' : ''}`);
        
        this.testResults.integration.push({
          test: 'Uploaded Files Present',
          success: hasUploadedFiles,
          fileCount: files.length,
          files: files.slice(0, 10),
          timestamp: new Date().toISOString()
        });
      }

      // Check knowledge base storage
      const kbPath = path.join(process.cwd(), 'data', 'knowledge-bases.json');
      if (fs.existsSync(kbPath)) {
        const kbData = JSON.parse(fs.readFileSync(kbPath, 'utf-8'));
        const kbWithFiles = kbData.filter(kb => kb.files && kb.files.length > 0);
        
        console.log(`  📚 Knowledge bases with files: ${kbWithFiles.length}`);
        
        this.testResults.integration.push({
          test: 'Knowledge Base File Integration',
          success: kbWithFiles.length > 0,
          knowledgeBasesWithFiles: kbWithFiles.length,
          timestamp: new Date().toISOString()
        });
      }

    } catch (error) {
      this.testResults.integration.push({
        test: 'Integration Test',
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      });
      console.log(`  ❌ Integration Error: ${error.message}`);
    }
  }

  // Generate Report
  generateReport() {
    console.log('\n📊 FILE UPLOAD VERIFICATION REPORT');
    console.log('=====================================');
    
    const categories = [
      { name: 'Backend API', results: this.testResults.backend },
      { name: 'Frontend UI', results: this.testResults.frontend },
      { name: 'Integration', results: this.testResults.integration }
    ];

    let overallSuccess = true;
    
    categories.forEach(category => {
      console.log(`\n${category.name}:`);
      category.results.forEach(result => {
        const status = result.success ? '✅' : '❌';
        console.log(`  ${status} ${result.test}`);
        if (!result.success) {
          overallSuccess = false;
          if (result.error) {
            console.log(`    Error: ${result.error}`);
          }
        }
      });
    });

    console.log('\n=====================================');
    console.log(`Overall Status: ${overallSuccess ? '✅ PASS' : '❌ FAIL'}`);
    console.log('=====================================');

    // Save detailed report
    const report = {
      timestamp: new Date().toISOString(),
      overallSuccess,
      results: this.testResults
    };
    
    fs.writeFileSync('file-upload-verification-report.json', JSON.stringify(report, null, 2));
    console.log('📄 Detailed report saved to: file-upload-verification-report.json');
  }

  // Run all tests
  async runAllTests() {
    try {
      await this.setup();
      await this.testBackendAPI();
      await this.testFrontendUI();
      await this.testIntegration();
      this.generateReport();
    } catch (error) {
      console.error('❌ Test suite error:', error);
    } finally {
      await this.cleanup();
    }
  }
}

// Run the test
const test = new FileUploadVerificationTest();
test.runAllTests().then(() => {
  console.log('\n🏁 File upload verification complete!');
  process.exit(0);
}).catch(error => {
  console.error('💥 Test failed:', error);
  process.exit(1);
});
