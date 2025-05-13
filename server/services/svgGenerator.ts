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
 * Generates a detailed coloring page SVG with American symbols
 * @param title Title for the coloring page
 * @param description Description of the image content
 * @returns SVG string content
 */
const generateColoringSvg = (title: string, description: string): string => {
  // Extract key elements from the description for simple shapes
  const elements = extractElementsFromDescription(description);
  
  // Default to American symbols if no specific elements are identified
  if (elements.length === 0) {
    elements.push('liberty bell', 'american flag', 'eagle', 'constitution');
  }
  
  // Add specific elements based on title or description
  if (description.toLowerCase().includes('washington') || 
      description.toLowerCase().includes('founding heroes') ||
      title.toLowerCase().includes('founding') ||
      title.toLowerCase().includes('america\'s birthday')) {
    if (!elements.includes('george washington')) {
      elements.push('george washington');
    }
  }
  
  if (description.toLowerCase().includes('independence hall') || 
      description.toLowerCase().includes('philadelphia')) {
    if (!elements.includes('independence hall')) {
      elements.push('independence hall');
    }
  }
  
  // Build SVG content with educational symbols of America
  let svgContent = `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" width="800" height="600">
    <rect width="800" height="600" fill="white"/>
    <text x="400" y="30" font-family="Arial" font-size="24" text-anchor="middle" fill="black">${title}</text>
    <text x="400" y="60" font-family="Arial" font-size="14" text-anchor="middle" fill="gray">Color these American symbols!</text>
  `;

  // Add Liberty Bell with more detail
  if (elements.includes('liberty bell')) {
    svgContent += `
      <g transform="translate(150, 100)">
        <!-- Crown -->
        <path d="M60,10 C80,0 120,0 140,10 C145,15 145,20 140,25 L140,40 L60,40 L60,25 C55,20 55,15 60,10 Z" 
              fill="none" stroke="black" stroke-width="2"/>
              
        <!-- Bell Body -->
        <path d="M65,40 L65,45 L135,45 L135,40 M60,45 C60,45 55,50 55,55 L55,150 C55,180 75,205 100,220 C125,205 145,180 145,150 L145,55 C145,50 140,45 140,45" 
              fill="none" stroke="black" stroke-width="2"/>
              
        <!-- Yoke -->
        <path d="M80,40 L80,70 M120,40 L120,70" fill="none" stroke="black" stroke-width="2"/>
              
        <!-- Crack -->
        <path d="M100,100 L95,150 L105,170 L95,190" fill="none" stroke="black" stroke-width="1.5" stroke-dasharray="3,2"/>
              
        <!-- Lip -->
        <path d="M85,220 L115,220" fill="none" stroke="black" stroke-width="3"/>
        
        <text x="100" y="250" font-family="Arial" font-size="16" text-anchor="middle">Liberty Bell (1752)</text>
        <text x="100" y="270" font-family="Arial" font-size="12" text-anchor="middle" fill="gray">Symbol of American Independence</text>
      </g>
    `;
  }

  // Add American Flag with more detail
  if (elements.includes('american flag') || elements.includes('flag')) {
    svgContent += `
      <g transform="translate(450, 100)">
        <!-- Flag outline -->
        <rect x="0" y="0" width="250" height="150" fill="none" stroke="black" stroke-width="2"/>
        
        <!-- Union (blue field) -->
        <rect x="0" y="0" width="100" height="80" fill="none" stroke="black" stroke-width="1"/>
        
        <!-- Stars (arranged in rows) -->
        ${generateStarsPattern(100, 80, 5, 6)}
        
        <!-- 13 Stripes for the 13 original colonies -->
        ${generateStripes(250, 150, 13)}
        
        <text x="125" y="180" font-family="Arial" font-size="16" text-anchor="middle">American Flag</text>
        <text x="125" y="200" font-family="Arial" font-size="12" text-anchor="middle" fill="gray">50 stars for states, 13 stripes for original colonies</text>
      </g>
    `;
  }

  // Add Bald Eagle with more detail
  if (elements.includes('eagle') || elements.includes('bald eagle')) {
    svgContent += `
      <g transform="translate(150, 320)">
        <!-- Head -->
        <path d="M100,30 C105,25 110,25 115,30 L120,40 C125,35 130,35 135,40 L130,45 C135,50 135,55 130,60 L115,65 C110,70 105,70 100,65 L85,60 C80,55 80,50 85,45 L80,40 C85,35 90,35 95,40 L100,30 Z" 
              fill="none" stroke="black" stroke-width="1.5"/>
        
        <!-- Eye -->
        <circle cx="118" cy="45" r="3" fill="none" stroke="black" stroke-width="1"/>
        
        <!-- Beak -->
        <path d="M130,50 C140,48 145,52 140,58 C135,55 130,55 130,60" fill="none" stroke="black" stroke-width="1.5"/>
        
        <!-- Body -->
        <path d="M100,65 C90,80 85,100 100,110 C115,100 110,80 100,65" fill="none" stroke="black" stroke-width="2"/>
        
        <!-- Wings -->
        <path d="M70,70 C50,80 50,100 70,110 C80,105 85,95 100,110 M130,70 C150,80 150,100 130,110 C120,105 115,95 100,110" 
              fill="none" stroke="black" stroke-width="2"/>
              
        <!-- Tail feathers -->
        <path d="M95,110 L90,140 M100,110 L100,150 M105,110 L110,140" fill="none" stroke="black" stroke-width="1.5"/>
        
        <text x="100" y="180" font-family="Arial" font-size="16" text-anchor="middle">Bald Eagle</text>
        <text x="100" y="200" font-family="Arial" font-size="12" text-anchor="middle" fill="gray">National bird of the United States</text>
      </g>
    `;
  }

  // Add Constitution with more detail
  if (elements.includes('constitution') || elements.includes('document')) {
    svgContent += `
      <g transform="translate(450, 320)">
        <!-- Parchment with rolled edges -->
        <path d="M30,30 C25,30 20,35 20,40 L20,200 C20,205 25,210 30,210 L170,210 C175,210 180,205 180,200 L180,40 C180,35 175,30 170,30 L30,30 Z" 
              fill="none" stroke="black" stroke-width="2"/>
        
        <!-- Rolled edges -->
        <path d="M20,40 C15,45 15,55 20,60 M180,40 C185,45 185,55 180,60" fill="none" stroke="black" stroke-width="1.5"/>
        
        <!-- Title -->
        <text x="100" y="50" font-family="Arial" font-size="10" font-weight="bold" text-anchor="middle">The Constitution</text>
        
        <!-- Famous opening -->
        <text x="100" y="70" font-family="Arial" font-size="8" text-anchor="middle">We the People</text>
        
        <!-- Text lines -->
        <path d="M40,80 L160,80 M40,90 L160,90 M40,100 L160,100 M40,110 L160,110 M40,120 L160,120 
                M40,130 L160,130 M40,140 L160,140 M40,150 L160,150 M40,160 L160,160 M40,170 L160,170" 
              fill="none" stroke="black" stroke-width="0.75"/>
              
        <!-- Signatures section -->
        <path d="M40,180 L70,180 M80,180 L100,180 M110,180 L130,180 M140,180 L160,180" 
              fill="none" stroke="black" stroke-width="0.75"/>
        
        <text x="100" y="230" font-family="Arial" font-size="16" text-anchor="middle">U.S. Constitution</text>
        <text x="100" y="250" font-family="Arial" font-size="12" text-anchor="middle" fill="gray">Written in 1787</text>
      </g>
    `;
  }

  // Add Statue of Liberty if mentioned
  if (elements.includes('statue of liberty')) {
    svgContent += `
      <g transform="translate(300, 100)">
        <!-- Crown -->
        <path d="M90,20 L85,40 L95,40 L100,20 L105,40 L115,40 L110,20 L120,40 L130,40 L125,20 L135,40 L145,40 L140,20 L150,40 L160,40 L155,20 L165,40 L175,40 L170,20 L180,40 L190,40 L185,20 L195,40 L200,50 L80,50 L85,40 L90,20 Z" 
              fill="none" stroke="black" stroke-width="1.5"/>
              
        <!-- Face -->
        <path d="M110,50 L110,65 C110,75 125,90 140,90 C155,90 170,75 170,65 L170,50" 
              fill="none" stroke="black" stroke-width="1.5"/>
              
        <!-- Neck -->
        <path d="M115,90 L115,100 L165,100 L165,90" fill="none" stroke="black" stroke-width="1.5"/>
              
        <!-- Robe -->
        <path d="M110,100 L90,200 L110,220 L140,220 L170,200 L170,100" 
              fill="none" stroke="black" stroke-width="2"/>
              
        <!-- Tablet -->
        <rect x="90" y="130" width="35" height="50" fill="none" stroke="black" stroke-width="1.5"/>
        <text x="107" y="155" font-family="Arial" font-size="8" text-anchor="middle">JULY</text>
        <text x="107" y="165" font-family="Arial" font-size="8" text-anchor="middle">IV</text>
        <text x="107" y="175" font-family="Arial" font-size="8" text-anchor="middle">MDCCLXXVI</text>
              
        <!-- Torch arm -->
        <path d="M170,110 C190,100 200,80 190,70" fill="none" stroke="black" stroke-width="1.5"/>
              
        <!-- Torch -->
        <path d="M190,70 L185,60 L195,60 L190,70 M185,60 L183,50 L197,50 L195,60 M190,50 L190,40" 
              fill="none" stroke="black" stroke-width="1"/>
              
        <!-- Flame -->
        <path d="M190,40 C185,30 195,30 190,25 C187,20 193,20 190,15" 
              fill="none" stroke="black" stroke-width="1" stroke-dasharray="2,1"/>
        
        <text x="140" y="250" font-family="Arial" font-size="16" text-anchor="middle">Statue of Liberty</text>
        <text x="140" y="270" font-family="Arial" font-size="12" text-anchor="middle" fill="gray">Gift from France in 1886</text>
      </g>
    `;
  }

  // Add George Washington if it's in the list
  if (elements.includes('george washington') || elements.includes('washington')) {
    svgContent += `
      <g transform="translate(500, 320)">
        <!-- Washington's profile outline -->
        <path d="M100,50 C105,40 110,30 120,25 C130,20 140,18 150,20 C160,25 165,35 168,50
                C170,65 170,80 165,95 C160,105 150,110 140,112 C130,115 120,114 110,110
                C100,105 95,95 90,85 C85,70 90,60 100,50 Z" 
              fill="none" stroke="black" stroke-width="1.5"/>
              
        <!-- Hair/wig -->
        <path d="M110,35 C120,25 135,20 150,22 C165,25 170,35 175,45
                C165,42 160,45 155,50 C150,40 140,35 130,32
                C120,30 110,32 105,40" 
              fill="none" stroke="black" stroke-width="1.5"/>
              
        <!-- Face features -->
        <path d="M130,55 C132,54 135,54 138,55 M145,70 L150,68 L140,68
                M125,80 C130,85 140,87 150,85" 
              fill="none" stroke="black" stroke-width="1.5"/>
              
        <!-- Coat collar and shoulders -->
        <path d="M90,100 C100,105 110,108 120,110 C130,112 140,112 150,110
                C160,108 170,105 180,100
                C175,115 165,125 150,130 C135,125 125,115 120,100" 
              fill="none" stroke="black" stroke-width="1.5"/>
              
        <text x="135" y="150" font-family="Arial" font-size="16" text-anchor="middle">George Washington</text>
        <text x="135" y="170" font-family="Arial" font-size="12" text-anchor="middle" fill="gray">America's First President</text>
      </g>
    `;
  }
  
  // Add Independence Hall if it's in the list
  if (elements.includes('independence hall')) {
    svgContent += `
      <g transform="translate(150, 450)">
        <!-- Building base -->
        <rect x="50" y="20" width="200" height="100" fill="none" stroke="black" stroke-width="1.5"/>
        
        <!-- Roof and spire -->
        <path d="M40,20 L260,20 L250,0 L50,0 Z" fill="none" stroke="black" stroke-width="1.5"/>
        <path d="M145,0 L145,-20 L155,-20 L155,0" fill="none" stroke="black" stroke-width="1.5"/>
        <path d="M140,-20 L160,-20 L150,-40 Z" fill="none" stroke="black" stroke-width="1.5"/>
        
        <!-- Windows -->
        <rect x="70" y="40" width="20" height="30" fill="none" stroke="black" stroke-width="1"/>
        <rect x="110" y="40" width="20" height="30" fill="none" stroke="black" stroke-width="1"/>
        <rect x="150" y="40" width="20" height="30" fill="none" stroke="black" stroke-width="1"/>
        <rect x="190" y="40" width="20" height="30" fill="none" stroke="black" stroke-width="1"/>
        
        <!-- Door -->
        <rect x="130" y="80" width="40" height="40" fill="none" stroke="black" stroke-width="1.5"/>
        <path d="M130,80 L170,80 L170,120 L130,120 Z" fill="none" stroke="black" stroke-width="1"/>
        <path d="M150,80 L150,120" fill="none" stroke="black" stroke-width="1"/>
        
        <!-- Steps -->
        <path d="M120,120 L180,120 L190,130 L110,130 Z" fill="none" stroke="black" stroke-width="1"/>
        
        <text x="150" y="150" font-family="Arial" font-size="16" text-anchor="middle">Independence Hall</text>
        <text x="150" y="170" font-family="Arial" font-size="12" text-anchor="middle" fill="gray">Birthplace of American Democracy</text>
      </g>
    `;
  }
  
  // Close the SVG
  svgContent += `</svg>`;
  
  return svgContent;
};

/**
 * Helper to generate stripe pattern for flag
 */
const generateStripes = (width: number, height: number, count: number): string => {
  let stripes = '';
  const stripeHeight = height / count;
  
  for (let i = 0; i < count; i++) {
    const y = i * stripeHeight;
    stripes += `<rect x="0" y="${y}" width="${width}" height="${stripeHeight}" fill="none" stroke="black" stroke-width="0.5"/>`;
  }
  
  return stripes;
};

/**
 * Helper to generate star pattern for flag
 */
const generateStarsPattern = (width: number, height: number, rows: number, cols: number): string => {
  let stars = '';
  const starSize = 4;
  const spacing = {
    x: width / (cols + 1),
    y: height / (rows + 1)
  };
  
  for (let i = 1; i <= rows; i++) {
    for (let j = 1; j <= cols; j++) {
      const cx = j * spacing.x;
      const cy = i * spacing.y;
      stars += generateStar(cx, cy, starSize);
    }
  }
  
  return stars;
};

/**
 * Helper to generate a star shape
 */
const generateStar = (cx: number, cy: number, size: number): string => {
  // Five-pointed star path
  const outerRadius = size;
  const innerRadius = size * 0.4;
  const points = [];
  
  for (let i = 0; i < 10; i++) {
    const radius = i % 2 === 0 ? outerRadius : innerRadius;
    const angle = Math.PI * i / 5;
    const x = cx + radius * Math.sin(angle);
    const y = cy - radius * Math.cos(angle);
    points.push(`${x},${y}`);
  }
  
  return `<path d="M ${points.join(' L ')} Z" fill="none" stroke="black" stroke-width="0.5"/>`;
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