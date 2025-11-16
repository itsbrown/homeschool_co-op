import { nanoid } from 'nanoid';

export const mockDataGenerators = {
  user: (overrides = {}) => ({
    username: `user_${nanoid(8)}`,
    email: `test_${nanoid(8)}@example.com`,
    password: 'hashedPassword123',
    name: `Test User ${nanoid(4)}`,
    role: 'parent',
    ...overrides
  }),

  school: (adminId: number, overrides = {}) => ({
    name: `Test School ${nanoid(6)}`,
    type: 'school',
    adminId,
    city: 'Test City',
    state: 'CA',
    zipCode: '12345',
    email: `school_${nanoid(8)}@example.com`,
    status: 'active',
    ...overrides
  }),

  location: (schoolId: number, overrides = {}) => ({
    schoolId,
    name: `Location ${nanoid(6)}`,
    address: `${Math.floor(Math.random() * 9999)} Test St`,
    city: 'Test City',
    state: 'CA',
    zipCode: '12345',
    ...overrides
  }),

  category: (schoolId: number, overrides = {}) => ({
    schoolId,
    name: `Category ${nanoid(6)}`,
    description: 'Test category description',
    ...overrides
  }),

  class: (schoolId: number, overrides = {}) => ({
    schoolId,
    title: `Class ${nanoid(6)}`,
    description: 'Test class description',
    price: Math.floor(Math.random() * 10000) + 1000, // $10-$100
    maxStudents: 20,
    status: 'active',
    ...overrides
  }),

  child: (parentId: number, overrides = {}) => ({
    parentId,
    firstName: `Child${nanoid(4)}`,
    lastName: 'Tester',
    dateOfBirth: new Date(2010 + Math.floor(Math.random() * 10), 0, 1),
    ...overrides
  }),

  enrollment: (childId: number, classId: number, overrides = {}) => ({
    childId,
    classId,
    status: 'active',
    enrollmentDate: new Date(),
    ...overrides
  }),

  notification: (userId: number, schoolId: number, overrides = {}) => ({
    userId,
    schoolId,
    title: `Notification ${nanoid(6)}`,
    message: 'Test notification message',
    type: 'info',
    isRead: false,
    ...overrides
  }),

  customForm: (schoolId: number, createdBy: number, overrides = {}) => ({
    schoolId,
    createdBy,
    title: `Form ${nanoid(6)}`,
    description: 'Test form description',
    fields: [
      {
        id: 'field1',
        type: 'text',
        label: 'Full Name',
        required: true
      },
      {
        id: 'field2',
        type: 'email',
        label: 'Email Address',
        required: true
      }
    ],
    status: 'published',
    ...overrides
  }),

  dailyFlowTemplate: (schoolId: number, createdBy: number, overrides = {}) => ({
    schoolId,
    createdBy,
    name: `Template ${nanoid(6)}`,
    description: 'Test daily flow template',
    fields: [
      {
        id: 'mood',
        type: 'select',
        label: 'Mood',
        options: ['Happy', 'Sad', 'Neutral']
      },
      {
        id: 'notes',
        type: 'textarea',
        label: 'Notes'
      }
    ],
    isActive: true,
    ...overrides
  }),

  curriculum: (schoolId: number, authorId: number, overrides = {}) => ({
    schoolId,
    authorId,
    title: `Curriculum ${nanoid(6)}`,
    subject: 'Mathematics',
    gradeLevel: '5th Grade',
    description: 'Test curriculum description',
    ...overrides
  }),

  lesson: (curriculumId: number, authorId: number, overrides = {}) => ({
    curriculumId,
    authorId,
    title: `Lesson ${nanoid(6)}`,
    content: 'Test lesson content',
    objectives: ['Objective 1', 'Objective 2'],
    ...overrides
  }),

  knowledgeBaseArticle: (schoolId: number, authorId: number, overrides = {}) => ({
    schoolId,
    authorId,
    title: `Article ${nanoid(6)}`,
    content: 'Test article content',
    category: 'General',
    tags: ['test', 'article'],
    ...overrides
  }),

  payment: (enrollmentId: number, overrides = {}) => ({
    enrollmentId,
    amount: Math.floor(Math.random() * 10000) + 1000,
    paymentMethod: 'stripe',
    status: 'completed',
    stripePaymentIntentId: `pi_test_${nanoid(12)}`,
    ...overrides
  }),

  discount: (schoolId: number, overrides = {}) => ({
    schoolId,
    code: `DISCOUNT${nanoid(6)}`,
    type: 'percentage',
    value: 10,
    isActive: true,
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
    ...overrides
  }),

  marketingLink: (schoolId: number, createdBy: number, overrides = {}) => ({
    schoolId,
    createdBy,
    name: `Campaign ${nanoid(6)}`,
    url: `https://example.com/${nanoid(8)}`,
    utmSource: 'test',
    utmMedium: 'email',
    utmCampaign: `campaign_${nanoid(6)}`,
    ...overrides
  }),
};

// Generate multiple records at once
export function generateMultiple<T>(generator: () => T, count: number): T[] {
  return Array.from({ length: count }, generator);
}

// Realistic test scenarios
export const testScenarios = {
  multiChildFamily: () => ({
    parent: mockDataGenerators.user({ role: 'parent', name: 'Parent Smith' }),
    children: [
      mockDataGenerators.child(0, { firstName: 'Alice', dateOfBirth: new Date('2012-05-15') }),
      mockDataGenerators.child(0, { firstName: 'Bob', dateOfBirth: new Date('2014-08-22') }),
      mockDataGenerators.child(0, { firstName: 'Charlie', dateOfBirth: new Date('2016-11-30') }),
    ]
  }),

  schoolWithMultipleLocations: (adminId: number) => ({
    school: mockDataGenerators.school(adminId, { name: 'Multi-Campus Academy' }),
    locations: [
      { name: 'Main Campus', address: '100 Main St' },
      { name: 'East Campus', address: '200 East Ave' },
      { name: 'West Campus', address: '300 West Blvd' },
    ]
  }),

  fullEnrollmentFlow: () => ({
    parent: mockDataGenerators.user({ role: 'parent' }),
    child: mockDataGenerators.child(0),
    class: mockDataGenerators.class(0, { price: 5000, title: 'Math 101' }),
    payment: mockDataGenerators.payment(0, { amount: 5000 }),
  }),
};
