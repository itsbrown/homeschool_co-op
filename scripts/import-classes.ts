import { parse } from 'csv-parse/sync';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { storage } from '../server/storage';

// Get current file path for ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function importClasses() {
  try {
    console.log('Starting class import from CSV...');
    
    // Read the CSV file
    const csvFilePath = path.join(__dirname, '../attached_assets/report---05-12-2025--15-03PM.csv');
    const csvData = fs.readFileSync(csvFilePath, 'utf8');
    
    // Parse the CSV data
    const records = parse(csvData, {
      columns: true,
      skip_empty_lines: true
    });
    
    console.log(`Found ${records.length} classes to import.`);
    
    // Find admin user for instructor reference
    const admin = await storage.getUserByUsername('admin');
    if (!admin) {
      console.error('Admin user not found. Make sure to create an admin user first.');
      return;
    }
    
    let importedCount = 0;
    
    // Process each record
    for (const record of records) {
      try {
        // Convert price from dollars to cents
        const price = parseFloat(record['Product Price']) || 0;
        const priceCents = Math.round(price * 100);
        
        // Process numbers
        const totalOrders = parseFloat(record['Total Orders']) || 0;
        const paidOrders = parseFloat(record['Number of ordered units that are fully paid']) || 0;
        const totalWaitlisted = parseFloat(record['Total Waitlisted']) || 0;
        const totalOrderValue = parseFloat(record['Total Order Value'].replace(/,/g, '')) || 0;
        const totalDiscounted = parseFloat(record['Total Discounted'].replace(/,/g, '')) || 0;
        const totalCollected = parseFloat(record['Total Collected'].replace(/,/g, '')) || 0;
        
        // Process number of sessions
        const numSessions = record['Number of Sessions'] ? parseInt(record['Number of Sessions']) : null;
        
        // Create the class object
        const classData = {
          title: record['Product Name'],
          description: record['Product description'] || `${record['Product Name']} - ${record['Product Category Name']}`,
          productId: record['Product ID'] || '',
          productType: record['Product Type'] || '',
          categoryName: record['Product Category Name'] || '',
          category: mapCategory(record['Product Category Name']),
          price: priceCents,
          instructorName: record['Instructor'] || 'American Seekers Academy',
          instructorId: admin.id,
          isPublished: true,
          totalOrders,
          paidOrders,
          totalWaitlisted,
          totalOrderValue: Math.round(totalOrderValue * 100), // convert to cents
          totalDiscounted: Math.round(totalDiscounted * 100), // convert to cents
          totalCollected: Math.round(totalCollected * 100), // convert to cents
          numSessions,
          sessionDays: record['Session Days'] || '',
          startDate: record['Session Start Date'] ? new Date(record['Session Start Date']) : null,
          endDate: record['Session End Date'] ? new Date(record['Session End Date']) : null,
        };
        
        // Create the class in storage
        await storage.createClass({
          ...classData,
          instructorId: admin.id
        });
        
        importedCount++;
        console.log(`Imported: ${record['Product Name']}`);
      } catch (error) {
        console.error(`Error importing class ${record['Product Name']}:`, error);
      }
    }
    
    console.log(`Successfully imported ${importedCount} classes.`);
  } catch (error) {
    console.error('Error importing classes:', error);
  }
}

// Map category name to category
function mapCategory(categoryName: string): string {
  const categoryMap: {[key: string]: string} = {
    'Membership Fees': 'membership',
    'SPRING 2025 10 WEEK PROGRAM': 'academic',
    'Summer Program': 'summer-camp'
  };
  
  return categoryMap[categoryName] || 'other';
}

// Run the import
importClasses().catch(console.error);