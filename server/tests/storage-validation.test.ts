
import { FileStorage } from '../file-storage';
import assert from 'assert';

async function testStorageValidation() {
  console.log('\nTesting storage validation...');
  const storage = new FileStorage();

  // Test user validation
  try {
    console.log('Testing invalid user ID validation...');
    await storage.getUser(-1);
    assert.fail('Should have thrown error for negative ID');
  } catch (error: any) {
    assert(error.message.includes('Invalid ID'));
    console.log('✓ Negative ID validation passed');
  }

  try {
    console.log('Testing invalid email validation...');
    await storage.getUserByEmail('invalid-email');
    assert.fail('Should have thrown error for invalid email');
  } catch (error: any) {
    assert(error.message.includes('Invalid email format'));
    console.log('✓ Email format validation passed');
  }

  try {
    console.log('Testing invalid user creation...');
    await storage.createUser({
      username: '',
      email: 'invalid',
      password: '',
      name: ''
    } as any);
    assert.fail('Should have thrown error for invalid user data');
  } catch (error: any) {
    assert(error.message.includes('required'));
    console.log('✓ User creation validation passed');
  }

  // Test curriculum validation
  try {
    console.log('Testing invalid curriculum ID validation...');
    await storage.getCurriculum(0);
    assert.fail('Should have thrown error for zero ID');
  } catch (error: any) {
    assert(error.message.includes('Invalid ID'));
    console.log('✓ Curriculum ID validation passed');
  }

  try {
    console.log('Testing invalid curriculum creation...');
    await storage.createCurriculum({
      title: '',
      subject: '',
      gradeLevel: '',
      authorId: -1
    } as any);
    assert.fail('Should have thrown error for invalid curriculum data');
  } catch (error: any) {
    assert(error.message.includes('required'));
    console.log('✓ Curriculum creation validation passed');
  }

  console.log('\nAll storage validation tests completed successfully!');
}

// Run tests
testStorageValidation().catch(error => {
  console.error('Test failed:', error);
  process.exit(1);
});
