import fs from 'fs';
import path from 'path';
import { User } from '@shared/schema';

const USERS_FILE_PATH = path.join(process.cwd(), 'data', 'users.json');

/**
 * Load users from the JSON file
 */
function loadUsers(): User[] {
  try {
    if (fs.existsSync(USERS_FILE_PATH)) {
      const data = fs.readFileSync(USERS_FILE_PATH, 'utf8');
      return JSON.parse(data);
    }
    return [];
  } catch (error) {
    console.error('Error loading users:', error);
    return [];
  }
}

/**
 * Save users to the JSON file
 */
function saveUsers(users: User[]): void {
  try {
    const dirPath = path.dirname(USERS_FILE_PATH);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
    fs.writeFileSync(USERS_FILE_PATH, JSON.stringify(users, null, 2));
  } catch (error) {
    console.error('Error saving users:', error);
  }
}

/**
 * Get a user by ID
 */
function getUserById(id: number): User | undefined {
  const users = loadUsers();
  return users.find(user => user.id === id);
}

/**
 * Get a user by username
 */
function getUserByUsername(username: string): User | undefined {
  const users = loadUsers();
  return users.find(user => user.username.toLowerCase() === username.toLowerCase());
}

/**
 * Get a user by email
 */
function getUserByEmail(email: string): User | undefined {
  const users = loadUsers();
  return users.find(user => user.email.toLowerCase() === email.toLowerCase());
}

/**
 * Create a user
 */
function createUser(userData: Omit<User, 'id' | 'createdAt'>): User {
  const users = loadUsers();
  const newId = users.length > 0 ? Math.max(...users.map(u => u.id)) + 1 : 1;
  
  const newUser: User = {
    ...userData,
    id: newId,
    createdAt: new Date()
  };
  
  users.push(newUser);
  saveUsers(users);
  return newUser;
}

/**
 * Update a user
 */
function updateUser(id: number, userData: Partial<User>): User | undefined {
  const users = loadUsers();
  const userIndex = users.findIndex(user => user.id === id);
  
  if (userIndex === -1) {
    return undefined;
  }
  
  const updatedUser = {
    ...users[userIndex],
    ...userData
  };
  
  users[userIndex] = updatedUser;
  saveUsers(users);
  return updatedUser;
}

export const userStorage = {
  getUserById,
  getUserByUsername,
  getUserByEmail,
  createUser,
  updateUser
};