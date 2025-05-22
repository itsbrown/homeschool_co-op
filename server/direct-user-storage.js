/**
 * A direct and simple implementation for user storage
 * This uses the file system to store users without any complex dependencies
 */
const fs = require('fs');
const path = require('path');

// Path to the users data file
const USERS_FILE_PATH = path.join(process.cwd(), 'data', 'users.json');

/**
 * Simple utility to create a new user
 */
function createNewUser(userData) {
  console.log('Direct user storage - creating user:', userData.email);
  
  try {
    // Read existing users
    let users = [];
    if (fs.existsSync(USERS_FILE_PATH)) {
      const data = fs.readFileSync(USERS_FILE_PATH, 'utf8');
      users = JSON.parse(data);
      console.log(`Read ${users.length} existing users from file`);
    } else {
      console.log('Users file does not exist, will create it');
    }
    
    // Check if user with this email already exists
    const emailExists = users.some(user => 
      user.email.toLowerCase() === userData.email.toLowerCase() || 
      user.username.toLowerCase() === userData.username.toLowerCase()
    );
    
    if (emailExists) {
      console.log('User with this email already exists');
      throw new Error('User with this email already exists');
    }
    
    // Generate a new user ID (max existing ID + 1)
    const newId = users.length > 0 ? Math.max(...users.map(u => u.id)) + 1 : 1;
    
    // Create the new user object
    const newUser = {
      id: newId,
      name: userData.name,
      username: userData.username,
      email: userData.email,
      password: userData.password, // Should already be hashed!
      role: userData.role || 'parent',
      avatar: userData.avatar || null,
      subscription: userData.subscription || 'free',
      createdAt: new Date().toISOString()
    };
    
    // Add to users array
    users.push(newUser);
    
    // Write the updated users array back to file
    const dirPath = path.dirname(USERS_FILE_PATH);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
    
    fs.writeFileSync(USERS_FILE_PATH, JSON.stringify(users, null, 2));
    console.log(`User created successfully with ID: ${newId}`);
    
    return newUser;
  } catch (error) {
    console.error('Error in direct user storage:', error);
    throw error;
  }
}

module.exports = {
  createNewUser
};