export interface User {
  id: number;
  username: string;
  email: string;
  name: string;
  role: 'learner' | 'parent' | 'educator' | 'admin';
  avatar?: string;
  subscription: 'free' | 'individual' | 'family' | 'educator' | 'institutional';
  createdAt: Date;
}

export interface Curriculum {
  id: number;
  title: string;
  description?: string;
  subject: string;
  gradeLevel: string;
  authorId: number;
  isPublished: boolean;
  isPublic: boolean;
  price: number;
  learningStyles: string[];
  content: any;
  createdAt: Date;
  updatedAt: Date;
}

export interface Lesson {
  id: number;
  title: string;
  description?: string;
  subject: string;
  gradeLevel: string;
  authorId: number;
  curriculumId?: number;
  isPublished: boolean;
  duration: number;
  content: any;
  status: 'draft' | 'published' | 'archived';
  createdAt: Date;
  updatedAt: Date;
}

export interface Event {
  id: number;
  title: string;
  description?: string;
  startDate: Date;
  endDate: Date;
  location?: string;
  organizerId: number;
  eventType: 'class' | 'meeting' | 'workshop' | 'camp' | 'other';
  createdAt: Date;
}

export interface MarketplaceItem {
  id: number;
  title: string;
  description?: string;
  price: number;
  sellerId: number;
  itemType: 'curriculum' | 'lesson' | 'resource' | 'activity';
  contentId: number;
  isActive: boolean;
  sales: number;
  revenue: number;
  createdAt: Date;
}

export interface Stats {
  totalStudents: number;
  activeCourses: number;
  completionRate: number;
  marketplaceSales: number;
}

export interface MarketplaceAnalytics {
  topSellingItems: Array<{
    title: string;
    revenue: number;
    percentage: number;
  }>;
}

export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

export interface AIGenerationFormData {
  subject: string;
  gradeLevel: string;
  learningStyles: string[];
  additionalDetails?: string;
  knowledgeBaseIds?: number[];
}
