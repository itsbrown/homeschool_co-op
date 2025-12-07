
/**
 * Simple File Upload API Test
 */

import fetch from 'node-fetch';
import FormData from 'form-data';
import fs from 'fs';
import path from 'path';

const BASE_URL = 'http://0.0.0.0:5000';

async function testFileUploadAPI() {
  console.log('🧪 Testing File Upload API...');
  
  try {
    // Create test file
    const testContent = `Test file for upload verification
Created: ${new Date().toISOString()}
Content: This is a test document for verifying file upload functionality.`;
    
    const testFilePath = path.join(process.cwd(), 'test-api-upload.txt');
    fs.writeFileSync(testFilePath, testContent);
    
    // Create form data
    const formData = new FormData();
    formData.append('files', fs.createReadStream(testFilePath));
    
    console.log('📤 Uploading file to /api/file-upload/knowledge-base...');
    
    // Make upload request
    const response = await fetch(`${BASE_URL}/api/file-upload/knowledge-base`, {
      method: 'POST',
      body: formData,
      headers: formData.getHeaders()
    });
    
    const responseText = await response.text();
    console.log('📥 Response status:', response.status);
    console.log('📄 Response headers:', Object.fromEntries(response.headers.entries()));
    console.log('📄 Response body:', responseText);
    
    let data;
    try {
      data = JSON.parse(responseText);
    } catch (e) {
      console.log('⚠️ Response is not JSON');
      data = { rawResponse: responseText };
    }
    
    if (response.ok) {
      console.log('✅ Upload successful!');
      if (data.files && data.files.length > 0) {
        console.log('📁 Uploaded files:');
        data.files.forEach((file, index) => {
          console.log(`  ${index + 1}. ${file.name} (${file.size} bytes) -> ${file.url}`);
        });
        
        // Test file retrieval
        const firstFile = data.files[0];
        console.log(`\n🔍 Testing file retrieval: ${firstFile.url}`);
        
        const fileResponse = await fetch(`${BASE_URL}${firstFile.url}`);
        console.log('📥 File retrieval status:', fileResponse.status);
        
        if (fileResponse.ok) {
          const fileContent = await fileResponse.text();
          console.log('✅ File retrieved successfully!');
          console.log('📄 File content preview:', fileContent.substring(0, 100));
        } else {
          console.log('❌ File retrieval failed');
        }
      }
    } else {
      console.log('❌ Upload failed!');
      console.log('💬 Error details:', data);
    }
    
    // Clean up
    if (fs.existsSync(testFilePath)) {
      fs.unlinkSync(testFilePath);
    }
    
  } catch (error) {
    console.error('💥 Test error:', error.message);
  }
}

// Run the test
testFileUploadAPI().then(() => {
  console.log('\n🏁 API test complete!');
}).catch(error => {
  console.error('💥 Test failed:', error);
});
