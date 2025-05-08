import { apiRequest } from "./queryClient";
import { 
  User, 
  Curriculum, 
  Lesson, 
  Event, 
  MarketplaceItem, 
  Stats,
  AIGenerationFormData
} from "./types";

// Auth API
export async function registerUser(userData: {
  username: string;
  email: string;
  password: string;
  name: string;
  role: string;
  subscription: string;
}): Promise<User> {
  const res = await apiRequest("POST", "/api/auth/register", userData);
  return (await res.json()).user;
}

export async function loginUser(credentials: { 
  username: string; 
  password: string 
}): Promise<User> {
  const res = await apiRequest("POST", "/api/auth/login", credentials);
  return (await res.json()).user;
}

export async function logoutUser(): Promise<void> {
  await apiRequest("POST", "/api/auth/logout");
}

export async function fetchCurrentUser(): Promise<User> {
  const res = await apiRequest("GET", "/api/auth/me");
  return await res.json();
}

// Curriculum API
export async function createCurriculum(data: Omit<Curriculum, "id" | "authorId" | "createdAt" | "updatedAt">): Promise<Curriculum> {
  const res = await apiRequest("POST", "/api/curricula", data);
  return await res.json();
}

export async function fetchCurricula(): Promise<Curriculum[]> {
  const res = await apiRequest("GET", "/api/curricula");
  return await res.json();
}

export async function fetchCurriculum(id: number): Promise<Curriculum> {
  const res = await apiRequest("GET", `/api/curricula/${id}`);
  return await res.json();
}

// Lesson API
export async function createLesson(data: Omit<Lesson, "id" | "authorId" | "createdAt" | "updatedAt">): Promise<Lesson> {
  const res = await apiRequest("POST", "/api/lessons", data);
  return await res.json();
}

export async function fetchLessons(): Promise<Lesson[]> {
  const res = await apiRequest("GET", "/api/lessons");
  return await res.json();
}

export async function fetchLesson(id: number): Promise<Lesson> {
  const res = await apiRequest("GET", `/api/lessons/${id}`);
  return await res.json();
}

// Event API
export async function createEvent(data: Omit<Event, "id" | "organizerId" | "createdAt">): Promise<Event> {
  const res = await apiRequest("POST", "/api/events", data);
  return await res.json();
}

export async function fetchUpcomingEvents(): Promise<Event[]> {
  const res = await apiRequest("GET", "/api/events/upcoming");
  return await res.json();
}

// Marketplace API
export async function createMarketplaceItem(data: Omit<MarketplaceItem, "id" | "sellerId" | "sales" | "revenue" | "createdAt">): Promise<MarketplaceItem> {
  const res = await apiRequest("POST", "/api/marketplace", data);
  return await res.json();
}

export async function fetchTopSellingItems(limit: number = 5): Promise<MarketplaceItem[]> {
  const res = await apiRequest("GET", `/api/marketplace/top?limit=${limit}`);
  return await res.json();
}

export async function fetchSellerItems(): Promise<MarketplaceItem[]> {
  const res = await apiRequest("GET", "/api/marketplace/seller");
  return await res.json();
}

// AI Generation API
export async function generateCurriculum(data: AIGenerationFormData): Promise<Curriculum> {
  const res = await apiRequest("POST", "/api/curricula/generate", data);
  return await res.json();
}

// Mock API for dashboard stats (would connect to a real API in production)
export async function fetchDashboardStats(): Promise<Stats> {
  // This would be a real API call in production
  return {
    totalStudents: 124,
    activeCourses: 8,
    completionRate: 87,
    marketplaceSales: 2450
  };
}
