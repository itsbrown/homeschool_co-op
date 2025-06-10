/**
 * Direct creation of test coloring pages
 */

import { generateAdvancedColoringPage } from './server/services/alternativeColoringGenerator';
import * as fs from 'fs/promises';
import * as path from 'path';

async function createTestColoringPages() {
  console.log('Creating test coloring pages...\n');

  const testPages = [
    {
      subject: 'George Washington',
      elements: ['George Washington portrait', 'American Flag', 'Mount Vernon mansion', 'Cherry tree', 'Colonial hat', 'Quill pen'],
      ageRange: '8-12',
      filename: 'george_washington_founder'
    },
    {
      subject: 'African Safari Animals',
      elements: ['Elephant', 'Lion', 'Giraffe', 'Zebra', 'Acacia tree', 'Safari jeep'],
      ageRange: '5-8', 
      filename: 'african_safari_animals'
    }
  ];

  const uploadsDir = path.join(process.cwd(), 'uploads', 'test-coloring-pages');
  await fs.mkdir(uploadsDir, { recursive: true });

  for (const page of testPages) {
    console.log(`Generating: ${page.subject} (Ages ${page.ageRange})`);
    
    try {
      const svgContent = await generateAdvancedColoringPage(
        page.subject,
        page.elements,
        page.ageRange
      );

      const filePath = path.join(uploadsDir, `${page.filename}.svg`);
      await fs.writeFile(filePath, svgContent);
      
      console.log(`✅ Created: /uploads/test-coloring-pages/${page.filename}.svg`);
      console.log(`   Size: ${svgContent.length} characters`);
      console.log(`   Quality: ${svgContent.length > 2000 ? 'High Detail' : 'Standard'}\n`);
      
    } catch (error) {
      console.log(`❌ Failed: ${error instanceof Error ? error.message : 'Unknown error'}\n`);
    }
  }
}

createTestColoringPages().catch(console.error);