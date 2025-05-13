/**
 * SVG Generator Service
 * Provides functions to generate SVG content for worksheet activities
 */

/**
 * Generates a simple SVG based on activity title and type
 * @param title Title of the activity
 * @param type Type of activity (coloring, crossword, etc.)
 * @param description Textual description of what should be in the image
 * @returns SVG content as string
 */
export const generateSvgForActivity = (
  title: string,
  type: string,
  description: string
): string => {
  // Generate SVG based on activity type
  switch (type.toLowerCase()) {
    case 'coloring':
      return generateColoringSvg(title, description);
    case 'maze':
      return generateMazeSvg(title);
    case 'crossword':
      return generateCrosswordSvg(title);
    case 'wordsearch':
      return generateWordSearchSvg(title);
    default:
      return generateDefaultSvg(title);
  }
};

/**
 * Generates a simple coloring page SVG
 * @param title Title for the coloring page
 * @param description Description of the image content
 * @returns SVG string content
 */
const generateColoringSvg = (title: string, description: string): string => {
  // Extract key elements from the description for simple shapes
  const elements = extractElementsFromDescription(description);
  
  // Build SVG content with basic shapes representing elements
  let svgContent = `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" width="800" height="600">
    <rect width="800" height="600" fill="white"/>
    <text x="400" y="30" font-family="Arial" font-size="24" text-anchor="middle" fill="black">${title}</text>
    <text x="400" y="60" font-family="Arial" font-size="14" text-anchor="middle" fill="gray">Color the elements below!</text>
  `;

  // Add simple shapes for american symbols if the description contains them
  if (description.toLowerCase().includes('liberty bell')) {
    // Simple Liberty Bell
    svgContent += `
      <g transform="translate(200, 150)">
        <path d="M40,20 C90,20 90,20 140,20 C145,20 150,25 150,30 L150,120 C150,180 120,220 90,240 C60,220 30,180 30,120 L30,30 C30,25 35,20 40,20 Z" 
              fill="none" stroke="black" stroke-width="2"/>
        <path d="M50,20 L50,50 M130,20 L130,50" fill="none" stroke="black" stroke-width="2"/>
        <path d="M70,240 L110,240" fill="none" stroke="black" stroke-width="4"/>
        <text x="90" y="280" font-family="Arial" font-size="16" text-anchor="middle">Liberty Bell</text>
      </g>
    `;
  }

  if (description.toLowerCase().includes('american flag') || description.toLowerCase().includes('flag')) {
    // Simple American Flag
    svgContent += `
      <g transform="translate(500, 150)">
        <rect x="0" y="0" width="200" height="120" fill="none" stroke="black" stroke-width="2"/>
        <rect x="0" y="0" width="80" height="65" fill="none" stroke="black" stroke-width="1"/>
        
        <!-- Stars (simplified) -->
        <circle cx="20" cy="15" r="5" fill="none" stroke="black"/>
        <circle cx="40" cy="15" r="5" fill="none" stroke="black"/>
        <circle cx="60" cy="15" r="5" fill="none" stroke="black"/>
        <circle cx="20" cy="35" r="5" fill="none" stroke="black"/>
        <circle cx="40" cy="35" r="5" fill="none" stroke="black"/>
        <circle cx="60" cy="35" r="5" fill="none" stroke="black"/>
        
        <!-- Stripes -->
        <path d="M0,65 L200,65 M0,75 L200,75 M0,85 L200,85 M0,95 L200,95 M0,105 L200,105" 
              fill="none" stroke="black" stroke-width="1"/>
        <text x="100" y="150" font-family="Arial" font-size="16" text-anchor="middle">American Flag</text>
      </g>
    `;
  }

  if (description.toLowerCase().includes('eagle') || description.toLowerCase().includes('bald eagle')) {
    // Simple Bald Eagle
    svgContent += `
      <g transform="translate(200, 350)">
        <path d="M90,50 C150,30 150,80 90,60 C30,80 30,30 90,50" fill="none" stroke="black" stroke-width="2"/>
        <circle cx="75" cy="45" r="5" fill="none" stroke="black"/>
        <path d="M40,70 C0,90 40,110 90,90 C140,110 180,90 140,70" fill="none" stroke="black" stroke-width="2"/>
        <text x="90" y="130" font-family="Arial" font-size="16" text-anchor="middle">Bald Eagle</text>
      </g>
    `;
  }

  if (description.toLowerCase().includes('constitution') || description.toLowerCase().includes('document')) {
    // Simple Constitution Document
    svgContent += `
      <g transform="translate(500, 350)">
        <rect x="30" y="30" width="140" height="180" fill="none" stroke="black" stroke-width="2"/>
        <path d="M50,60 L150,60 M50,80 L150,80 M50,100 L150,100 M50,120 L150,120 M50,140 L150,140" 
              fill="none" stroke="black" stroke-width="1"/>
        <text x="100" y="45" font-family="Arial" font-size="10" text-anchor="middle">We the People</text>
        <text x="100" y="230" font-family="Arial" font-size="16" text-anchor="middle">Constitution</text>
      </g>
    `;
  }

  // Close the SVG
  svgContent += `</svg>`;
  
  return svgContent;
};

/**
 * Extract key elements from a description string
 * @param description The description to parse
 * @returns Array of key elements found
 */
const extractElementsFromDescription = (description: string): string[] => {
  const keywords = [
    'liberty bell', 'american flag', 'flag', 'eagle', 'bald eagle', 
    'constitution', 'document', 'independence hall', 'statue of liberty'
  ];
  
  const elements: string[] = [];
  
  keywords.forEach(keyword => {
    if (description.toLowerCase().includes(keyword)) {
      elements.push(keyword);
    }
  });
  
  return elements;
};

/**
 * Generate a simple maze SVG
 * @param title Title for the maze
 * @returns SVG string content
 */
const generateMazeSvg = (title: string): string => {
  // Simple maze pattern
  return `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" width="800" height="600">
    <rect width="800" height="600" fill="white"/>
    <text x="400" y="30" font-family="Arial" font-size="24" text-anchor="middle" fill="black">${title}</text>
    
    <!-- Simple maze pattern -->
    <g transform="translate(150, 100)" stroke="black" stroke-width="2" fill="none">
      <rect x="0" y="0" width="500" height="400"/>
      <path d="M0,100 L400,100 M100,0 L100,300 M200,100 L200,400 M300,0 L300,300 M0,200 L500,200 M400,200 L400,400"/>
      <circle cx="30" cy="30" r="20" fill="green"/>
      <text x="30" y="35" font-family="Arial" font-size="15" text-anchor="middle" fill="white">Start</text>
      <circle cx="470" cy="370" r="20" fill="red"/>
      <text x="470" y="375" font-family="Arial" font-size="15" text-anchor="middle" fill="white">End</text>
    </g>
  </svg>
  `;
};

/**
 * Generate a simple crossword SVG
 * @param title Title for the crossword
 * @returns SVG string content
 */
const generateCrosswordSvg = (title: string): string => {
  // Simple crossword grid
  return `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" width="800" height="600">
    <rect width="800" height="600" fill="white"/>
    <text x="400" y="30" font-family="Arial" font-size="24" text-anchor="middle" fill="black">${title}</text>
    
    <!-- Simple crossword grid -->
    <g transform="translate(250, 100)">
      ${generateCrosswordGrid(10, 10, 30)}
    </g>
  </svg>
  `;
};

/**
 * Helper to generate a crossword grid of cells
 */
const generateCrosswordGrid = (rows: number, cols: number, cellSize: number): string => {
  let grid = '';
  
  // Generate grid cells
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      const x = j * cellSize;
      const y = i * cellSize;
      
      // Randomly decide if this cell is part of the crossword (75% chance)
      const isActive = Math.random() < 0.75;
      
      if (isActive) {
        grid += `<rect x="${x}" y="${y}" width="${cellSize}" height="${cellSize}" fill="white" stroke="black" stroke-width="1"/>`;
      } else {
        grid += `<rect x="${x}" y="${y}" width="${cellSize}" height="${cellSize}" fill="black" stroke="black" stroke-width="1"/>`;
      }
    }
  }
  
  // Add some numbers to first few cells
  for (let i = 1; i <= 5; i++) {
    const row = Math.floor(Math.random() * rows);
    const col = Math.floor(Math.random() * cols);
    const x = col * cellSize + 5;
    const y = row * cellSize + 10;
    
    grid += `<text x="${x}" y="${y}" font-family="Arial" font-size="8" fill="black">${i}</text>`;
  }
  
  return grid;
};

/**
 * Generate a simple word search SVG
 * @param title Title for the word search
 * @returns SVG string content
 */
const generateWordSearchSvg = (title: string): string => {
  // Simple word search grid
  return `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" width="800" height="600">
    <rect width="800" height="600" fill="white"/>
    <text x="400" y="30" font-family="Arial" font-size="24" text-anchor="middle" fill="black">${title}</text>
    
    <!-- Simple word search grid -->
    <g transform="translate(250, 100)">
      ${generateWordSearchGrid(10, 10, 30)}
    </g>
  </svg>
  `;
};

/**
 * Helper to generate a word search grid of letters
 */
const generateWordSearchGrid = (rows: number, cols: number, cellSize: number): string => {
  let grid = '';
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  
  // Generate grid of cells with random letters
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      const x = j * cellSize;
      const y = i * cellSize;
      const letter = letters.charAt(Math.floor(Math.random() * letters.length));
      
      grid += `<rect x="${x}" y="${y}" width="${cellSize}" height="${cellSize}" fill="white" stroke="black" stroke-width="1"/>`;
      grid += `<text x="${x + cellSize/2}" y="${y + cellSize/2 + 5}" font-family="Arial" font-size="16" text-anchor="middle" fill="black">${letter}</text>`;
    }
  }
  
  return grid;
};

/**
 * Generate a default SVG for any other activity type
 * @param title Title for the activity
 * @returns SVG string content
 */
const generateDefaultSvg = (title: string): string => {
  return `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" width="800" height="600">
    <rect width="800" height="600" fill="white"/>
    <text x="400" y="30" font-family="Arial" font-size="24" text-anchor="middle" fill="black">${title}</text>
    <text x="400" y="300" font-family="Arial" font-size="20" text-anchor="middle" fill="black">Activity Worksheet</text>
    <rect x="150" y="100" width="500" height="400" fill="none" stroke="black" stroke-width="2" stroke-dasharray="5,5"/>
    <text x="400" y="500" font-family="Arial" font-size="16" text-anchor="middle" fill="gray">Complete the activity in this area</text>
  </svg>
  `;
};