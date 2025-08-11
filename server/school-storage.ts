import { School, InsertSchool } from "@shared/schema";
import fs from "fs";
import path from "path";

// Path to store schools data
const SCHOOLS_FILE_PATH = path.join(process.cwd(), "data", "schools.json");

// Ensure the data directory exists
const dataDir = path.join(process.cwd(), "data");
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Load schools from the JSON file
function loadSchools(): School[] {
  if (!fs.existsSync(SCHOOLS_FILE_PATH)) {
    return [];
  }
  try {
    const fileContent = fs.readFileSync(SCHOOLS_FILE_PATH, "utf-8");
    return JSON.parse(fileContent);
  } catch (error) {
    console.error("Error loading schools:", error);
    return [];
  }
}

// Save schools to the JSON file
function saveSchools(schools: School[]): void {
  try {
    fs.writeFileSync(SCHOOLS_FILE_PATH, JSON.stringify(schools, null, 2), "utf-8");
  } catch (error) {
    console.error("Error saving schools:", error);
  }
}

// Get all schools
function getSchools(): School[] {
  return loadSchools();
}

// Get a school by ID
function getSchoolById(id: number): School | undefined {
  const schools = loadSchools();
  return schools.find((school) => school.id === id);
}

// Get schools administered by a specific user
function getSchoolsByAdminId(adminId: number): School[] {
  const schools = loadSchools();
  return schools.filter((school) => school.adminId === adminId);
}

// Create a new school
function createSchool(schoolData: InsertSchool & { adminId: number }): School {
  const schools = loadSchools();

  // Generate a new ID
  const newId = schools.length > 0 
    ? Math.max(...schools.map((school) => school.id)) + 1 
    : 1;

  const newSchool: School = {
    id: newId,
    ...schoolData,
    status: "pending",
    isVerified: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  schools.push(newSchool);
  saveSchools(schools);

  return newSchool;
}

// Update a school
function updateSchool(id: number, schoolData: Partial<School>): School | undefined {
  const schools = loadSchools();
  const schoolIndex = schools.findIndex((school) => school.id === id);

  if (schoolIndex === -1) {
    return undefined;
  }

  // Update the school
  const updatedSchool = {
    ...schools[schoolIndex],
    ...schoolData,
    updatedAt: new Date(),
  };

  schools[schoolIndex] = updatedSchool;
  saveSchools(schools);

  return updatedSchool;
}

export const schoolStorage = {
  getSchools,
  getAllSchools() {
    try {
      const filePath = path.join(process.cwd(), 'data', 'schools.json');

      if (fs.existsSync(filePath)) {
        const fileContent = fs.readFileSync(filePath, 'utf8');
        const schools = JSON.parse(fileContent);
        console.log(`📚 Loaded ${schools.length} schools from file storage`);
        return schools;
      } else {
        console.log('⚠️ Schools file not found, returning empty array');
        return [];
      }
    } catch (error) {
      console.error('❌ Error loading schools:', error);
      return [];
    }
  },

  getSchoolById,
  getSchoolsByAdminId,
  createSchool,
  updateSchool,
};