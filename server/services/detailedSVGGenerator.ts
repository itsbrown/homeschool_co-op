/**
 * Detailed SVG Generator for Educational Coloring Pages
 * Creates high-quality, subject-specific educational illustrations
 */

/**
 * Create detailed vehicles SVG coloring page
 */
export function createDetailedVehiclesSVG(prompt: string, elements: string[]): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
    <rect x="0" y="0" width="512" height="512" fill="white"/>
    
    <!-- Car with detailed features -->
    <rect x="50" y="300" width="120" height="40" rx="8" fill="none" stroke="black" stroke-width="3"/>
    <rect x="60" y="280" width="100" height="20" rx="10" fill="none" stroke="black" stroke-width="3"/>
    <circle cx="80" cy="350" r="18" fill="none" stroke="black" stroke-width="3"/>
    <circle cx="140" cy="350" r="18" fill="none" stroke="black" stroke-width="3"/>
    <circle cx="80" cy="350" r="8" fill="none" stroke="black" stroke-width="2"/>
    <circle cx="140" cy="350" r="8" fill="none" stroke="black" stroke-width="2"/>
    <rect x="75" y="285" width="20" height="15" fill="none" stroke="black" stroke-width="2"/>
    <rect x="125" y="285" width="20" height="15" fill="none" stroke="black" stroke-width="2"/>
    <rect x="90" y="320" width="8" height="8" fill="none" stroke="black" stroke-width="2"/>
    <rect x="120" y="320" width="8" height="8" fill="none" stroke="black" stroke-width="2"/>
    <ellipse cx="110" cy="310" rx="15" ry="5" fill="none" stroke="black" stroke-width="2"/>
    
    <!-- Large truck with cargo -->
    <rect x="200" y="320" width="80" height="50" fill="none" stroke="black" stroke-width="3"/>
    <rect x="280" y="300" width="60" height="70" fill="none" stroke="black" stroke-width="3"/>
    <circle cx="220" cy="380" r="20" fill="none" stroke="black" stroke-width="3"/>
    <circle cx="300" cy="380" r="20" fill="none" stroke="black" stroke-width="3"/>
    <circle cx="220" cy="380" r="10" fill="none" stroke="black" stroke-width="2"/>
    <circle cx="300" cy="380" r="10" fill="none" stroke="black" stroke-width="2"/>
    <rect x="290" y="320" width="25" height="15" fill="none" stroke="black" stroke-width="2"/>
    <rect x="320" y="320" width="15" height="15" fill="none" stroke="black" stroke-width="2"/>
    <rect x="210" y="340" width="50" height="20" fill="none" stroke="black" stroke-width="2"/>
    <rect x="215" y="330" width="10" height="10" fill="none" stroke="black" stroke-width="2"/>
    <rect x="235" y="330" width="10" height="10" fill="none" stroke="black" stroke-width="2"/>
    <rect x="255" y="330" width="10" height="10" fill="none" stroke="black" stroke-width="2"/>
    
    <!-- Detailed airplane -->
    <ellipse cx="100" cy="120" rx="80" ry="15" fill="none" stroke="black" stroke-width="3"/>
    <rect x="60" y="105" width="80" height="30" rx="15" fill="none" stroke="black" stroke-width="3"/>
    <ellipse cx="40" cy="120" rx="25" ry="8" fill="none" stroke="black" stroke-width="3"/>
    <rect x="90" y="80" width="20" height="25" fill="none" stroke="black" stroke-width="3"/>
    <rect x="95" y="145" width="10" height="20" fill="none" stroke="black" stroke-width="2"/>
    <circle cx="90" cy="120" r="4" fill="none" stroke="black" stroke-width="2"/>
    <circle cx="110" cy="120" r="4" fill="none" stroke="black" stroke-width="2"/>
    <circle cx="130" cy="120" r="4" fill="none" stroke="black" stroke-width="2"/>
    <ellipse cx="65" cy="95" rx="15" ry="6" fill="none" stroke="black" stroke-width="2"/>
    <ellipse cx="125" cy="95" rx="15" ry="6" fill="none" stroke="black" stroke-width="2"/>
    <path d="M 180 120 Q 200 110 220 120 Q 200 130 180 120" fill="none" stroke="black" stroke-width="2"/>
    
    <!-- Detailed bicycle -->
    <circle cx="380" cy="350" r="30" fill="none" stroke="black" stroke-width="3"/>
    <circle cx="450" cy="350" r="30" fill="none" stroke="black" stroke-width="3"/>
    <line x1="380" y1="320" x2="420" y2="280" stroke="black" stroke-width="3"/>
    <line x1="420" y1="280" x2="450" y2="320" stroke="black" stroke-width="3"/>
    <line x1="380" y1="350" x2="450" y2="350" stroke="black" stroke-width="3"/>
    <line x1="420" y1="280" x2="420" y2="320" stroke="black" stroke-width="3"/>
    <circle cx="420" cy="270" r="8" fill="none" stroke="black" stroke-width="2"/>
    <rect x="410" y="245" width="20" height="8" rx="4" fill="none" stroke="black" stroke-width="2"/>
    <line x1="400" y1="260" x2="440" y2="260" stroke="black" stroke-width="2"/>
    <circle cx="380" cy="350" r="20" fill="none" stroke="black" stroke-width="1"/>
    <circle cx="450" cy="350" r="20" fill="none" stroke="black" stroke-width="1"/>
    <circle cx="380" cy="350" r="10" fill="none" stroke="black" stroke-width="1"/>
    <circle cx="450" cy="350" r="10" fill="none" stroke="black" stroke-width="1"/>
    
    <!-- Road and environment -->
    <line x1="0" y1="400" x2="512" y2="400" stroke="black" stroke-width="3" stroke-dasharray="15,10"/>
    <rect x="20" y="410" width="472" height="20" fill="none" stroke="black" stroke-width="2"/>
    
    <!-- Sun -->
    <circle cx="450" cy="80" r="25" fill="none" stroke="black" stroke-width="3"/>
    <line x1="425" y1="55" x2="435" y2="65" stroke="black" stroke-width="2"/>
    <line x1="475" y1="55" x2="465" y2="65" stroke="black" stroke-width="2"/>
    <line x1="425" y1="105" x2="435" y2="95" stroke="black" stroke-width="2"/>
    <line x1="475" y1="105" x2="465" y2="95" stroke="black" stroke-width="2"/>
    <line x1="400" y1="80" x2="415" y2="80" stroke="black" stroke-width="2"/>
    <line x1="485" y1="80" x2="500" y2="80" stroke="black" stroke-width="2"/>
    <line x1="450" y1="30" x2="450" y2="45" stroke="black" stroke-width="2"/>
    <line x1="450" y1="115" x2="450" y2="130" stroke="black" stroke-width="2"/>
    
    <!-- Clouds -->
    <ellipse cx="150" cy="60" rx="20" ry="12" fill="none" stroke="black" stroke-width="2"/>
    <ellipse cx="170" cy="55" rx="25" ry="15" fill="none" stroke="black" stroke-width="2"/>
    <ellipse cx="190" cy="60" rx="20" ry="12" fill="none" stroke="black" stroke-width="2"/>
    
    <!-- Building -->
    <rect x="350" y="200" width="60" height="80" fill="none" stroke="black" stroke-width="3"/>
    <polygon points="350,200 380,160 410,200" fill="none" stroke="black" stroke-width="3"/>
    <rect x="365" y="240" width="12" height="20" fill="none" stroke="black" stroke-width="2"/>
    <rect x="385" y="220" width="15" height="15" fill="none" stroke="black" stroke-width="2"/>
    <line x1="385" y1="227" x2="400" y2="227" stroke="black" stroke-width="1"/>
    <line x1="392" y1="220" x2="392" y2="235" stroke="black" stroke-width="1"/>
    
    <!-- Trees -->
    <rect x="15" y="250" width="8" height="30" fill="none" stroke="black" stroke-width="2"/>
    <circle cx="19" cy="240" r="15" fill="none" stroke="black" stroke-width="2"/>
    <circle cx="12" cy="235" r="10" fill="none" stroke="black" stroke-width="2"/>
    <circle cx="26" cy="235" r="10" fill="none" stroke="black" stroke-width="2"/>
  </svg>`;
}

/**
 * Create detailed sea creatures SVG coloring page
 */
export function createDetailedSeaCreaturesSVG(prompt: string, elements: string[]): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
    <rect x="0" y="0" width="512" height="512" fill="white"/>
    
    <!-- Large fish -->
    <ellipse cx="150" cy="180" rx="60" ry="30" fill="none" stroke="black" stroke-width="3"/>
    <polygon points="90,180 60,160 60,200" fill="none" stroke="black" stroke-width="3"/>
    <circle cx="130" cy="170" r="6" fill="none" stroke="black" stroke-width="2"/>
    <path d="M 120 190 Q 130 195 140 190" fill="none" stroke="black" stroke-width="2"/>
    <path d="M 100 160 Q 120 140 140 160" fill="none" stroke="black" stroke-width="2"/>
    <path d="M 100 200 Q 120 220 140 200" fill="none" stroke="black" stroke-width="2"/>
    <line x1="110" y1="165" x2="130" y2="175" stroke="black" stroke-width="1"/>
    <line x1="110" y1="195" x2="130" y2="185" stroke="black" stroke-width="1"/>
    
    <!-- Detailed octopus -->
    <circle cx="350" cy="200" r="40" fill="none" stroke="black" stroke-width="3"/>
    <circle cx="340" cy="190" r="4" fill="none" stroke="black" stroke-width="2"/>
    <circle cx="360" cy="190" r="4" fill="none" stroke="black" stroke-width="2"/>
    <path d="M 345 210 Q 350 215 355 210" fill="none" stroke="black" stroke-width="2"/>
    
    <!-- Octopus tentacles -->
    <path d="M 320 220 Q 300 240 280 270 Q 290 290 310 280" fill="none" stroke="black" stroke-width="3"/>
    <path d="M 330 240 Q 320 270 300 300 Q 320 310 340 290" fill="none" stroke="black" stroke-width="3"/>
    <path d="M 370 240 Q 380 270 400 300 Q 380 310 360 290" fill="none" stroke="black" stroke-width="3"/>
    <path d="M 380 220 Q 400 240 420 270 Q 410 290 390 280" fill="none" stroke="black" stroke-width="3"/>
    <path d="M 320 230 Q 290 250 270 280 Q 280 300 300 285" fill="none" stroke="black" stroke-width="3"/>
    <path d="M 380 230 Q 410 250 430 280 Q 420 300 400 285" fill="none" stroke="black" stroke-width="3"/>
    <path d="M 340 245 Q 330 280 320 310 Q 340 320 350 300" fill="none" stroke="black" stroke-width="3"/>
    <path d="M 360 245 Q 370 280 380 310 Q 360 320 350 300" fill="none" stroke="black" stroke-width="3"/>
    
    <!-- Suction cups on tentacles -->
    <circle cx="285" cy="265" r="3" fill="none" stroke="black" stroke-width="1"/>
    <circle cx="305" cy="295" r="3" fill="none" stroke="black" stroke-width="1"/>
    <circle cx="395" cy="265" r="3" fill="none" stroke="black" stroke-width="1"/>
    <circle cx="375" cy="295" r="3" fill="none" stroke="black" stroke-width="1"/>
    
    <!-- Seahorse -->
    <path d="M 80 320 Q 90 300 100 320 Q 110 340 100 360 Q 90 380 80 360 Q 70 350 80 320" fill="none" stroke="black" stroke-width="3"/>
    <circle cx="85" cy="310" r="8" fill="none" stroke="black" stroke-width="2"/>
    <circle cx="83" cy="308" r="2" fill="none" stroke="black" stroke-width="2"/>
    <path d="M 75 305 Q 70 300 75 295" fill="none" stroke="black" stroke-width="2"/>
    <path d="M 95 340 Q 110 350 100 365" fill="none" stroke="black" stroke-width="2"/>
    <path d="M 85 375 Q 90 385 95 375 Q 100 380 95 385" fill="none" stroke="black" stroke-width="2"/>
    <line x1="85" y1="325" x2="85" y2="335" stroke="black" stroke-width="1"/>
    <line x1="85" y1="345" x2="85" y2="355" stroke="black" stroke-width="1"/>
    
    <!-- Starfish -->
    <path d="M 250 350 L 265 330 L 280 350 L 270 370 L 250 370 L 240 350 L 250 330 L 265 340 L 250 350" fill="none" stroke="black" stroke-width="3"/>
    <path d="M 250 350 L 230 340 L 240 320 L 260 330 L 250 350" fill="none" stroke="black" stroke-width="3"/>
    <path d="M 250 350 L 270 370 L 290 360 L 280 340 L 250 350" fill="none" stroke="black" stroke-width="3"/>
    <path d="M 250 350 L 240 370 L 220 360 L 230 340 L 250 350" fill="none" stroke="black" stroke-width="3"/>
    <path d="M 250 350 L 260 330 L 270 310 L 250 320 L 250 350" fill="none" stroke="black" stroke-width="3"/>
    <circle cx="250" cy="350" r="8" fill="none" stroke="black" stroke-width="2"/>
    
    <!-- Coral and seaweed -->
    <path d="M 450 400 Q 460 380 470 400 Q 480 420 470 440 Q 460 420 450 440" fill="none" stroke="black" stroke-width="3"/>
    <path d="M 460 400 Q 470 380 480 400 Q 490 420 480 440 Q 470 420 460 440" fill="none" stroke="black" stroke-width="2"/>
    <path d="M 440 400 Q 450 380 460 400 Q 470 420 460 440 Q 450 420 440 440" fill="none" stroke="black" stroke-width="2"/>
    
    <!-- Bubbles -->
    <circle cx="100" cy="100" r="8" fill="none" stroke="black" stroke-width="2"/>
    <circle cx="120" cy="80" r="6" fill="none" stroke="black" stroke-width="2"/>
    <circle cx="140" cy="60" r="4" fill="none" stroke="black" stroke-width="2"/>
    <circle cx="200" cy="120" r="5" fill="none" stroke="black" stroke-width="2"/>
    <circle cx="220" cy="100" r="7" fill="none" stroke="black" stroke-width="2"/>
    <circle cx="320" cy="80" r="6" fill="none" stroke="black" stroke-width="2"/>
    <circle cx="380" cy="100" r="8" fill="none" stroke="black" stroke-width="2"/>
    
    <!-- Ocean floor -->
    <path d="M 0 440 Q 50 430 100 440 Q 150 450 200 440 Q 250 430 300 440 Q 350 450 400 440 Q 450 430 512 440 L 512 512 L 0 512 Z" fill="none" stroke="black" stroke-width="2"/>
    
    <!-- Sea plants -->
    <path d="M 30 440 Q 40 420 35 400 Q 45 420 40 440" fill="none" stroke="black" stroke-width="2"/>
    <path d="M 180 440 Q 190 420 185 400 Q 195 420 190 440" fill="none" stroke="black" stroke-width="2"/>
    <path d="M 380 440 Q 390 420 385 400 Q 395 420 390 440" fill="none" stroke="black" stroke-width="2"/>
  </svg>`;
}

/**
 * Create detailed forest animals SVG coloring page
 */
export function createDetailedForestAnimalsSVG(prompt: string, elements: string[]): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
    <rect x="0" y="0" width="512" height="512" fill="white"/>
    
    <!-- Detailed deer -->
    <ellipse cx="150" cy="280" rx="40" ry="25" fill="none" stroke="black" stroke-width="3"/>
    <circle cx="130" cy="240" r="20" fill="none" stroke="black" stroke-width="3"/>
    <circle cx="125" cy="235" r="3" fill="none" stroke="black" stroke-width="2"/>
    <ellipse cx="120" cy="245" rx="4" ry="2" fill="none" stroke="black" stroke-width="2"/>
    <path d="M 115 250 Q 125 255 135 250" fill="none" stroke="black" stroke-width="2"/>
    <line x1="130" y1="255" x2="130" y2="265" stroke="black" stroke-width="2"/>
    
    <!-- Deer antlers -->
    <line x1="125" y1="220" x2="115" y2="200" stroke="black" stroke-width="3"/>
    <line x1="135" y1="220" x2="145" y2="200" stroke="black" stroke-width="3"/>
    <line x1="115" y1="205" x2="110" y2="195" stroke="black" stroke-width="2"/>
    <line x1="115" y1="210" x2="120" y2="200" stroke="black" stroke-width="2"/>
    <line x1="145" y1="205" x2="150" y2="195" stroke="black" stroke-width="2"/>
    <line x1="145" y1="210" x2="140" y2="200" stroke="black" stroke-width="2"/>
    
    <!-- Deer legs -->
    <rect x="120" y="305" width="8" height="30" fill="none" stroke="black" stroke-width="2"/>
    <rect x="135" y="305" width="8" height="30" fill="none" stroke="black" stroke-width="2"/>
    <rect x="150" y="305" width="8" height="30" fill="none" stroke="black" stroke-width="2"/>
    <rect x="165" y="305" width="8" height="30" fill="none" stroke="black" stroke-width="2"/>
    
    <!-- Rabbit -->
    <ellipse cx="320" cy="300" rx="25" ry="20" fill="none" stroke="black" stroke-width="3"/>
    <circle cx="310" cy="275" r="15" fill="none" stroke="black" stroke-width="3"/>
    <ellipse cx="300" cy="250" rx="6" ry="15" fill="none" stroke="black" stroke-width="2"/>
    <ellipse cx="315" cy="250" rx="6" ry="15" fill="none" stroke="black" stroke-width="2"/>
    <circle cx="308" cy="272" r="2" fill="none" stroke="black" stroke-width="2"/>
    <circle cx="312" cy="272" r="2" fill="none" stroke="black" stroke-width="2"/>
    <path d="M 305 280 Q 310 285 315 280" fill="none" stroke="black" stroke-width="2"/>
    <line x1="310" y1="285" x2="310" y2="290" stroke="black" stroke-width="1"/>
    
    <!-- Rabbit legs -->
    <ellipse cx="305" cy="330" rx="8" ry="15" fill="none" stroke="black" stroke-width="2"/>
    <ellipse cx="325" cy="330" rx="8" ry="15" fill="none" stroke="black" stroke-width="2"/>
    <ellipse cx="315" cy="325" rx="6" ry="10" fill="none" stroke="black" stroke-width="2"/>
    <ellipse cx="335" cy="325" rx="6" ry="10" fill="none" stroke="black" stroke-width="2"/>
    
    <!-- Squirrel -->
    <ellipse cx="80" cy="200" rx="20" ry="15" fill="none" stroke="black" stroke-width="3"/>
    <circle cx="70" cy="180" r="12" fill="none" stroke="black" stroke-width="3"/>
    <circle cx="68" cy="178" r="2" fill="none" stroke="black" stroke-width="2"/>
    <ellipse cx="65" cy="185" rx="3" ry="2" fill="none" stroke="black" stroke-width="2"/>
    <path d="M 63 188 Q 68 192 73 188" fill="none" stroke="black" stroke-width="2"/>
    
    <!-- Squirrel tail -->
    <path d="M 100 200 Q 120 180 130 160 Q 125 140 115 150 Q 105 170 100 200" fill="none" stroke="black" stroke-width="3"/>
    <path d="M 110 170 Q 120 160 125 150" fill="none" stroke="black" stroke-width="2"/>
    <path d="M 115 180 Q 125 170 130 160" fill="none" stroke="black" stroke-width="2"/>
    
    <!-- Owl in tree -->
    <ellipse cx="420" cy="180" rx="25" ry="30" fill="none" stroke="black" stroke-width="3"/>
    <circle cx="410" cy="170" r="8" fill="none" stroke="black" stroke-width="2"/>
    <circle cx="430" cy="170" r="8" fill="none" stroke="black" stroke-width="2"/>
    <circle cx="410" cy="170" r="4" fill="none" stroke="black" stroke-width="2"/>
    <circle cx="430" cy="170" r="4" fill="none" stroke="black" stroke-width="2"/>
    <path d="M 415 180 Q 420 185 425 180" fill="none" stroke="black" stroke-width="2"/>
    <polygon points="405,160 415,150 420,160" fill="none" stroke="black" stroke-width="2"/>
    <polygon points="425,160 435,150 440,160" fill="none" stroke="black" stroke-width="2"/>
    
    <!-- Tree trunk and branches -->
    <rect x="400" y="210" width="40" height="130" fill="none" stroke="black" stroke-width="4"/>
    <path d="M 380 250 Q 400 240 420 250" fill="none" stroke="black" stroke-width="3"/>
    <path d="M 420 230 Q 440 220 460 230" fill="none" stroke="black" stroke-width="3"/>
    <path d="M 410 270 Q 390 260 370 270" fill="none" stroke="black" stroke-width="3"/>
    
    <!-- Tree leaves/foliage -->
    <circle cx="380" cy="160" r="35" fill="none" stroke="black" stroke-width="3"/>
    <circle cx="430" cy="140" r="40" fill="none" stroke="black" stroke-width="3"/>
    <circle cx="460" cy="180" r="30" fill="none" stroke="black" stroke-width="3"/>
    <circle cx="400" cy="120" r="25" fill="none" stroke="black" stroke-width="3"/>
    
    <!-- Forest floor and plants -->
    <path d="M 0 340 Q 100 330 200 340 Q 300 350 400 340 Q 450 330 512 340 L 512 512 L 0 512 Z" fill="none" stroke="black" stroke-width="2"/>
    <path d="M 50 340 Q 60 320 55 300 Q 65 320 60 340" fill="none" stroke="black" stroke-width="2"/>
    <path d="M 250 340 Q 260 320 255 300 Q 265 320 260 340" fill="none" stroke="black" stroke-width="2"/>
    <circle cx="30" cy="335" r="4" fill="none" stroke="black" stroke-width="2"/>
    <circle cx="180" cy="335" r="4" fill="none" stroke="black" stroke-width="2"/>
    <circle cx="280" cy="335" r="4" fill="none" stroke="black" stroke-width="2"/>
    
    <!-- Mushrooms -->
    <ellipse cx="200" cy="330" rx="12" ry="6" fill="none" stroke="black" stroke-width="2"/>
    <rect x="197" y="330" width="6" height="10" fill="none" stroke="black" stroke-width="2"/>
    <circle cx="195" cy="327" r="2" fill="none" stroke="black" stroke-width="1"/>
    <circle cx="205" cy="327" r="2" fill="none" stroke="black" stroke-width="1"/>
  </svg>`;
}

/**
 * Create detailed historical figure SVG (for Antoinette Brown Blackwell)
 */
export function createDetailedHistoricalFigureSVG(prompt: string, elements: string[]): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
    <rect x="0" y="0" width="512" height="512" fill="white"/>
    
    <!-- Church building -->
    <rect x="150" y="200" width="200" height="150" fill="none" stroke="black" stroke-width="3"/>
    <polygon points="150,200 250,120 350,200" fill="none" stroke="black" stroke-width="3"/>
    <rect x="220" y="280" width="60" height="70" fill="none" stroke="black" stroke-width="3"/>
    <rect x="170" y="230" width="40" height="60" fill="none" stroke="black" stroke-width="2"/>
    <rect x="300" y="230" width="40" height="60" fill="none" stroke="black" stroke-width="2"/>
    <line x1="170" y1="250" x2="210" y2="250" stroke="black" stroke-width="1"/>
    <line x1="190" y1="230" x2="190" y2="290" stroke="black" stroke-width="1"/>
    <line x1="300" y1="250" x2="340" y2="250" stroke="black" stroke-width="1"/>
    <line x1="320" y1="230" x2="320" y2="290" stroke="black" stroke-width="1"/>
    
    <!-- Church steeple and cross -->
    <rect x="240" y="80" width="20" height="40" fill="none" stroke="black" stroke-width="3"/>
    <polygon points="240,80 250,60 260,80" fill="none" stroke="black" stroke-width="3"/>
    <line x1="250" y1="45" x2="250" y2="65" stroke="black" stroke-width="3"/>
    <line x1="245" y1="50" x2="255" y2="50" stroke="black" stroke-width="3"/>
    
    <!-- Female minister figure -->
    <circle cx="100" cy="250" r="25" fill="none" stroke="black" stroke-width="3"/>
    <rect x="80" y="275" width="40" height="80" fill="none" stroke="black" stroke-width="3"/>
    <rect x="85" y="280" width="30" height="10" fill="none" stroke="black" stroke-width="2"/>
    <circle cx="95" cy="245" r="3" fill="none" stroke="black" stroke-width="2"/>
    <circle cx="105" cy="245" r="3" fill="none" stroke="black" stroke-width="2"/>
    <path d="M 92 255 Q 100 260 108 255" fill="none" stroke="black" stroke-width="2"/>
    
    <!-- Hair styled for 1800s -->
    <path d="M 80 240 Q 90 220 100 240" fill="none" stroke="black" stroke-width="2"/>
    <path d="M 100 240 Q 110 220 120 240" fill="none" stroke="black" stroke-width="2"/>
    <path d="M 85 235 Q 100 225 115 235" fill="none" stroke="black" stroke-width="2"/>
    
    <!-- Minister's dress -->
    <rect x="70" y="355" width="60" height="40" fill="none" stroke="black" stroke-width="3"/>
    <line x1="80" y1="370" x2="120" y2="370" stroke="black" stroke-width="2"/>
    <line x1="80" y1="380" x2="120" y2="380" stroke="black" stroke-width="2"/>
    
    <!-- Arms and hands -->
    <rect x="65" y="290" width="12" height="30" fill="none" stroke="black" stroke-width="2"/>
    <rect x="123" y="290" width="12" height="30" fill="none" stroke="black" stroke-width="2"/>
    <circle cx="71" cy="325" r="5" fill="none" stroke="black" stroke-width="2"/>
    <circle cx="129" cy="325" r="5" fill="none" stroke="black" stroke-width="2"/>
    
    <!-- Bible in hands -->
    <rect x="65" y="320" width="20" height="15" fill="none" stroke="black" stroke-width="2"/>
    <line x1="70" y1="325" x2="80" y2="325" stroke="black" stroke-width="1"/>
    <line x1="70" y1="330" x2="80" y2="330" stroke="black" stroke-width="1"/>
    
    <!-- Pulpit -->
    <rect x="380" y="280" width="60" height="80" fill="none" stroke="black" stroke-width="3"/>
    <rect x="370" y="270" width="80" height="15" fill="none" stroke="black" stroke-width="3"/>
    <rect x="385" y="285" width="50" height="30" fill="none" stroke="black" stroke-width="2"/>
    <path d="M 390 300 Q 410 295 430 300" fill="none" stroke="black" stroke-width="2"/>
    <rect x="405" y="290" width="10" height="8" fill="none" stroke="black" stroke-width="2"/>
    
    <!-- Church pews -->
    <rect x="50" y="380" width="100" height="20" fill="none" stroke="black" stroke-width="2"/>
    <rect x="50" y="410" width="100" height="20" fill="none" stroke="black" stroke-width="2"/>
    <rect x="200" y="380" width="100" height="20" fill="none" stroke="black" stroke-width="2"/>
    <rect x="200" y="410" width="100" height="20" fill="none" stroke="black" stroke-width="2"/>
    
    <!-- Decorative elements -->
    <circle cx="250" cy="160" r="15" fill="none" stroke="black" stroke-width="2"/>
    <polygon points="240,155 250,145 260,155" fill="none" stroke="black" stroke-width="2"/>
    <polygon points="245,165 250,155 255,165" fill="none" stroke="black" stroke-width="2"/>
    
    <!-- Banner or text scroll -->
    <rect x="30" y="100" width="120" height="80" rx="10" fill="none" stroke="black" stroke-width="3"/>
    <line x1="40" y1="120" x2="140" y2="120" stroke="black" stroke-width="2"/>
    <line x1="40" y1="140" x2="140" y2="140" stroke="black" stroke-width="2"/>
    <line x1="40" y1="160" x2="140" y2="160" stroke="black" stroke-width="2"/>
    
    <!-- Books/educational materials -->
    <rect x="20" y="450" width="30" height="40" fill="none" stroke="black" stroke-width="2"/>
    <rect x="60" y="450" width="30" height="40" fill="none" stroke="black" stroke-width="2"/>
    <rect x="100" y="450" width="30" height="40" fill="none" stroke="black" stroke-width="2"/>
    <line x1="25" y1="460" x2="45" y2="460" stroke="black" stroke-width="1"/>
    <line x1="25" y1="470" x2="45" y2="470" stroke="black" stroke-width="1"/>
    <line x1="65" y1="460" x2="85" y2="460" stroke="black" stroke-width="1"/>
    <line x1="65" y1="470" x2="85" y2="470" stroke="black" stroke-width="1"/>
  </svg>`;
}

/**
 * Create detailed space SVG coloring page
 */
export function createDetailedSpaceSVG(prompt: string, elements: string[]): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
    <rect x="0" y="0" width="512" height="512" fill="white"/>
    
    <!-- Rocket ship -->
    <polygon points="200,50 220,100 180,100" fill="none" stroke="black" stroke-width="3"/>
    <rect x="180" y="100" width="40" height="120" fill="none" stroke="black" stroke-width="3"/>
    <polygon points="170,220 190,260 210,260 230,220" fill="none" stroke="black" stroke-width="3"/>
    <circle cx="190" cy="130" r="8" fill="none" stroke="black" stroke-width="2"/>
    <circle cx="210" cy="130" r="8" fill="none" stroke="black" stroke-width="2"/>
    <circle cx="200" cy="160" r="6" fill="none" stroke="black" stroke-width="2"/>
    <rect x="185" y="180" width="30" height="15" fill="none" stroke="black" stroke-width="2"/>
    <line x1="190" y1="185" x2="210" y2="185" stroke="black" stroke-width="1"/>
    <line x1="190" y1="190" x2="210" y2="190" stroke="black" stroke-width="1"/>
    
    <!-- Planet Earth -->
    <circle cx="400" cy="150" r="50" fill="none" stroke="black" stroke-width="3"/>
    <path d="M 360 130 Q 380 110 400 130 Q 420 150 440 130" fill="none" stroke="black" stroke-width="2"/>
    <path d="M 360 170 Q 380 190 400 170 Q 420 150 440 170" fill="none" stroke="black" stroke-width="2"/>
    <path d="M 370 140 Q 390 120 410 140" fill="none" stroke="black" stroke-width="2"/>
    <path d="M 370 180 Q 390 200 410 180" fill="none" stroke="black" stroke-width="2"/>
    
    <!-- Moon -->
    <circle cx="80" cy="100" r="35" fill="none" stroke="black" stroke-width="3"/>
    <circle cx="70" cy="90" r="6" fill="none" stroke="black" stroke-width="2"/>
    <circle cx="90" cy="110" r="4" fill="none" stroke="black" stroke-width="2"/>
    <circle cx="85" cy="85" r="3" fill="none" stroke="black" stroke-width="2"/>
    <circle cx="75" cy="115" r="5" fill="none" stroke="black" stroke-width="2"/>
    
    <!-- Saturn -->
    <circle cx="350" cy="350" r="40" fill="none" stroke="black" stroke-width="3"/>
    <ellipse cx="350" cy="350" rx="60" ry="15" fill="none" stroke="black" stroke-width="2"/>
    <ellipse cx="350" cy="350" rx="65" ry="18" fill="none" stroke="black" stroke-width="2"/>
    
    <!-- Space station -->
    <rect x="120" y="300" width="80" height="40" fill="none" stroke="black" stroke-width="3"/>
    <circle cx="160" cy="320" r="25" fill="none" stroke="black" stroke-width="3"/>
    <rect x="100" y="310" width="20" height="20" fill="none" stroke="black" stroke-width="2"/>
    <rect x="200" y="310" width="20" height="20" fill="none" stroke="black" stroke-width="2"/>
    <line x1="90" y1="320" x2="110" y2="320" stroke="black" stroke-width="2"/>
    <line x1="210" y1="320" x2="230" y2="320" stroke="black" stroke-width="2"/>
    <rect x="150" y="280" width="20" height="20" fill="none" stroke="black" stroke-width="2"/>
    <rect x="150" y="340" width="20" height="20" fill="none" stroke="black" stroke-width="2"/>
    
    <!-- Astronaut -->
    <circle cx="300" cy="280" r="20" fill="none" stroke="black" stroke-width="3"/>
    <rect x="285" y="300" width="30" height="40" fill="none" stroke="black" stroke-width="3"/>
    <rect x="275" y="310" width="10" height="20" fill="none" stroke="black" stroke-width="2"/>
    <rect x="315" y="310" width="10" height="20" fill="none" stroke="black" stroke-width="2"/>
    <circle cx="295" cy="275" r="3" fill="none" stroke="black" stroke-width="2"/>
    <circle cx="305" cy="275" r="3" fill="none" stroke="black" stroke-width="2"/>
    <path d="M 295 285 Q 300 290 305 285" fill="none" stroke="black" stroke-width="2"/>
    <rect x="290" y="340" width="8" height="15" fill="none" stroke="black" stroke-width="2"/>
    <rect x="302" y="340" width="8" height="15" fill="none" stroke="black" stroke-width="2"/>
    
    <!-- Stars -->
    <path d="M 50 50 L 52 56 L 58 56 L 53 60 L 55 66 L 50 62 L 45 66 L 47 60 L 42 56 L 48 56 Z" fill="none" stroke="black" stroke-width="2"/>
    <path d="M 450 80 L 452 86 L 458 86 L 453 90 L 455 96 L 450 92 L 445 96 L 447 90 L 442 86 L 448 86 Z" fill="none" stroke="black" stroke-width="2"/>
    <path d="M 100 400 L 102 406 L 108 406 L 103 410 L 105 416 L 100 412 L 95 416 L 97 410 L 92 406 L 98 406 Z" fill="none" stroke="black" stroke-width="2"/>
    <path d="M 450 450 L 452 456 L 458 456 L 453 460 L 455 466 L 450 462 L 445 466 L 447 460 L 442 456 L 448 456 Z" fill="none" stroke="black" stroke-width="2"/>
    
    <!-- Smaller stars -->
    <circle cx="150" cy="80" r="2" fill="none" stroke="black" stroke-width="2"/>
    <circle cx="380" cy="50" r="2" fill="none" stroke="black" stroke-width="2"/>
    <circle cx="50" cy="200" r="2" fill="none" stroke="black" stroke-width="2"/>
    <circle cx="480" cy="200" r="2" fill="none" stroke="black" stroke-width="2"/>
    <circle cx="250" cy="400" r="2" fill="none" stroke="black" stroke-width="2"/>
    <circle cx="30" cy="450" r="2" fill="none" stroke="black" stroke-width="2"/>
    
    <!-- Comet -->
    <ellipse cx="150" cy="200" rx="8" ry="6" fill="none" stroke="black" stroke-width="2"/>
    <path d="M 142 200 Q 120 190 100 185" fill="none" stroke="black" stroke-width="2"/>
    <path d="M 142 206 Q 115 210 90 215" fill="none" stroke="black" stroke-width="2"/>
    <path d="M 142 194 Q 125 180 110 170" fill="none" stroke="black" stroke-width="2"/>
  </svg>`;
}

/**
 * Create detailed garden SVG coloring page
 */
export function createDetailedGardenSVG(prompt: string, elements: string[]): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
    <rect x="0" y="0" width="512" height="512" fill="white"/>
    
    <!-- Large flower -->
    <circle cx="150" cy="200" r="30" fill="none" stroke="black" stroke-width="3"/>
    <ellipse cx="120" cy="180" rx="15" ry="25" fill="none" stroke="black" stroke-width="3"/>
    <ellipse cx="180" cy="180" rx="15" ry="25" fill="none" stroke="black" stroke-width="3"/>
    <ellipse cx="120" cy="220" rx="15" ry="25" fill="none" stroke="black" stroke-width="3"/>
    <ellipse cx="180" cy="220" rx="15" ry="25" fill="none" stroke="black" stroke-width="3"/>
    <ellipse cx="150" cy="170" rx="25" ry="15" fill="none" stroke="black" stroke-width="3"/>
    <ellipse cx="150" cy="230" rx="25" ry="15" fill="none" stroke="black" stroke-width="3"/>
    <circle cx="150" cy="200" r="10" fill="none" stroke="black" stroke-width="2"/>
    <line x1="150" y1="230" x2="150" y2="300" stroke="black" stroke-width="4"/>
    
    <!-- Sunflower -->
    <circle cx="350" cy="150" r="40" fill="none" stroke="black" stroke-width="3"/>
    <ellipse cx="310" cy="130" rx="12" ry="20" fill="none" stroke="black" stroke-width="3"/>
    <ellipse cx="390" cy="130" rx="12" ry="20" fill="none" stroke="black" stroke-width="3"/>
    <ellipse cx="310" cy="170" rx="12" ry="20" fill="none" stroke="black" stroke-width="3"/>
    <ellipse cx="390" cy="170" rx="12" ry="20" fill="none" stroke="black" stroke-width="3"/>
    <ellipse cx="330" cy="110" rx="20" ry="12" fill="none" stroke="black" stroke-width="3"/>
    <ellipse cx="370" cy="110" rx="20" ry="12" fill="none" stroke="black" stroke-width="3"/>
    <ellipse cx="330" cy="190" rx="20" ry="12" fill="none" stroke="black" stroke-width="3"/>
    <ellipse cx="370" cy="190" rx="20" ry="12" fill="none" stroke="black" stroke-width="3"/>
    <circle cx="350" cy="150" r="25" fill="none" stroke="black" stroke-width="2"/>
    <circle cx="350" cy="150" r="15" fill="none" stroke="black" stroke-width="2"/>
    <line x1="350" y1="190" x2="350" y2="280" stroke="black" stroke-width="5"/>
    
    <!-- Butterfly -->
    <ellipse cx="250" cy="120" rx="20" ry="15" fill="none" stroke="black" stroke-width="3"/>
    <ellipse cx="250" cy="140" rx="15" ry="12" fill="none" stroke="black" stroke-width="3"/>
    <ellipse cx="280" cy="120" rx="20" ry="15" fill="none" stroke="black" stroke-width="3"/>
    <ellipse cx="280" cy="140" rx="15" ry="12" fill="none" stroke="black" stroke-width="3"/>
    <line x1="265" y1="110" x2="265" y2="150" stroke="black" stroke-width="3"/>
    <circle cx="265" cy="105" r="3" fill="none" stroke="black" stroke-width="2"/>
    <line x1="262" y1="100" x2="260" y2="95" stroke="black" stroke-width="2"/>
    <line x1="268" y1="100" x2="270" y2="95" stroke="black" stroke-width="2"/>
    <circle cx="240" cy="115" r="2" fill="none" stroke="black" stroke-width="1"/>
    <circle cx="250" cy="125" r="2" fill="none" stroke="black" stroke-width="1"/>
    <circle cx="270" cy="115" r="2" fill="none" stroke="black" stroke-width="1"/>
    <circle cx="280" cy="125" r="2" fill="none" stroke="black" stroke-width="1"/>
    
    <!-- Rose -->
    <circle cx="80" cy="300" r="25" fill="none" stroke="black" stroke-width="3"/>
    <circle cx="80" cy="300" r="18" fill="none" stroke="black" stroke-width="2"/>
    <circle cx="80" cy="300" r="12" fill="none" stroke="black" stroke-width="2"/>
    <circle cx="80" cy="300" r="6" fill="none" stroke="black" stroke-width="2"/>
    <line x1="80" y1="325" x2="80" y2="380" stroke="black" stroke-width="4"/>
    <path d="M 75 340 Q 65 330 70 325" fill="none" stroke="black" stroke-width="2"/>
    <path d="M 85 360 Q 95 350 90 345" fill="none" stroke="black" stroke-width="2"/>
    <ellipse cx="65" cy="335" rx="8" ry="12" fill="none" stroke="black" stroke-width="2"/>
    <ellipse cx="95" cy="355" rx="8" ry="12" fill="none" stroke="black" stroke-width="2"/>
    
    <!-- Tulips -->
    <ellipse cx="420" cy="280" rx="12" ry="20" fill="none" stroke="black" stroke-width="3"/>
    <ellipse cx="440" cy="280" rx="12" ry="20" fill="none" stroke="black" stroke-width="3"/>
    <ellipse cx="460" cy="280" rx="12" ry="20" fill="none" stroke="black" stroke-width="3"/>
    <line x1="420" y1="300" x2="420" y2="350" stroke="black" stroke-width="3"/>
    <line x1="440" y1="300" x2="440" y2="350" stroke="black" stroke-width="3"/>
    <line x1="460" y1="300" x2="460" y2="350" stroke="black" stroke-width="3"/>
    <ellipse cx="430" cy="320" rx="6" ry="10" fill="none" stroke="black" stroke-width="2"/>
    <ellipse cx="450" cy="320" rx="6" ry="10" fill="none" stroke="black" stroke-width="2"/>
    
    <!-- Grass and plants -->
    <path d="M 0 380 Q 50 370 100 380 Q 150 390 200 380 Q 250 370 300 380 Q 350 390 400 380 Q 450 370 512 380 L 512 512 L 0 512 Z" fill="none" stroke="black" stroke-width="2"/>
    <path d="M 30 380 Q 40 360 35 340" fill="none" stroke="black" stroke-width="2"/>
    <path d="M 180 380 Q 190 360 185 340" fill="none" stroke="black" stroke-width="2"/>
    <path d="M 280 380 Q 290 360 285 340" fill="none" stroke="black" stroke-width="2"/>
    <path d="M 380 380 Q 390 360 385 340" fill="none" stroke="black" stroke-width="2"/>
    <path d="M 480 380 Q 490 360 485 340" fill="none" stroke="black" stroke-width="2"/>
    
    <!-- Bee -->
    <ellipse cx="200" cy="250" rx="12" ry="8" fill="none" stroke="black" stroke-width="2"/>
    <line x1="195" y1="247" x2="205" y2="247" stroke="black" stroke-width="2"/>
    <line x1="195" y1="253" x2="205" y2="253" stroke="black" stroke-width="2"/>
    <circle cx="188" cy="250" r="3" fill="none" stroke="black" stroke-width="2"/>
    <ellipse cx="190" cy="240" rx="4" ry="2" fill="none" stroke="black" stroke-width="1"/>
    <ellipse cx="190" cy="260" rx="4" ry="2" fill="none" stroke="black" stroke-width="1"/>
    <line x1="185" y1="248" x2="183" y2="245" stroke="black" stroke-width="1"/>
    <line x1="185" y1="252" x2="183" y2="255" stroke="black" stroke-width="1"/>
    
    <!-- Garden tools -->
    <line x1="480" y1="400" x2="480" y2="450" stroke="black" stroke-width="3"/>
    <ellipse cx="480" cy="395" rx="8" ry="5" fill="none" stroke="black" stroke-width="2"/>
    <line x1="460" y1="410" x2="460" y2="460" stroke="black" stroke-width="3"/>
    <rect x="455" y="405" width="10" height="10" fill="none" stroke="black" stroke-width="2"/>
  </svg>`;
}

/**
 * Create detailed general SVG coloring page
 */
export function createDetailedGeneralSVG(prompt: string, elements: string[]): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
    <rect x="0" y="0" width="512" height="512" fill="white"/>
    
    <!-- Detailed house -->
    <rect x="180" y="250" width="152" height="120" fill="none" stroke="black" stroke-width="3"/>
    <polygon points="180,250 256,180 332,250" fill="none" stroke="black" stroke-width="3"/>
    <rect x="200" y="300" width="30" height="50" fill="none" stroke="black" stroke-width="3"/>
    <rect x="280" y="290" width="40" height="40" fill="none" stroke="black" stroke-width="3"/>
    <line x1="280" y1="310" x2="320" y2="310" stroke="black" stroke-width="2"/>
    <line x1="300" y1="290" x2="300" y2="330" stroke="black" stroke-width="2"/>
    <circle cx="208" cy="325" r="3" fill="none" stroke="black" stroke-width="2"/>
    <rect x="240" y="280" width="25" height="25" fill="none" stroke="black" stroke-width="2"/>
    <line x1="240" y1="292" x2="265" y2="292" stroke="black" stroke-width="1"/>
    <line x1="252" y1="280" x2="252" y2="305" stroke="black" stroke-width="1"/>
    
    <!-- Chimney with smoke -->
    <rect x="290" y="180" width="20" height="40" fill="none" stroke="black" stroke-width="3"/>
    <circle cx="305" cy="170" r="5" fill="none" stroke="black" stroke-width="2"/>
    <circle cx="310" cy="155" r="6" fill="none" stroke="black" stroke-width="2"/>
    <circle cx="315" cy="140" r="5" fill="none" stroke="black" stroke-width="2"/>
    
    <!-- Large tree with details -->
    <rect x="120" y="300" width="20" height="70" fill="none" stroke="black" stroke-width="4"/>
    <circle cx="130" cy="280" r="40" fill="none" stroke="black" stroke-width="3"/>
    <circle cx="110" cy="260" r="25" fill="none" stroke="black" stroke-width="3"/>
    <circle cx="150" cy="260" r="25" fill="none" stroke="black" stroke-width="3"/>
    <circle cx="120" cy="300" r="20" fill="none" stroke="black" stroke-width="3"/>
    <circle cx="140" cy="300" r="20" fill="none" stroke="black" stroke-width="3"/>
    <path d="M 115 290 Q 125 280 135 290" fill="none" stroke="black" stroke-width="2"/>
    <path d="M 125 270 Q 135 260 145 270" fill="none" stroke="black" stroke-width="2"/>
    
    <!-- Detailed clouds -->
    <circle cx="100" cy="80" r="20" fill="none" stroke="black" stroke-width="3"/>
    <circle cx="120" cy="75" r="25" fill="none" stroke="black" stroke-width="3"/>
    <circle cx="140" cy="80" r="20" fill="none" stroke="black" stroke-width="3"/>
    <circle cx="110" cy="100" r="15" fill="none" stroke="black" stroke-width="3"/>
    <circle cx="130" cy="100" r="15" fill="none" stroke="black" stroke-width="3"/>
    
    <circle cx="350" cy="60" r="15" fill="none" stroke="black" stroke-width="3"/>
    <circle cx="365" cy="55" r="20" fill="none" stroke="black" stroke-width="3"/>
    <circle cx="380" cy="60" r="15" fill="none" stroke="black" stroke-width="3"/>
    <circle cx="360" cy="75" r="12" fill="none" stroke="black" stroke-width="3"/>
    <circle cx="375" cy="75" r="12" fill="none" stroke="black" stroke-width="3"/>
    
    <!-- Sun with rays -->
    <circle cx="450" cy="100" r="30" fill="none" stroke="black" stroke-width="3"/>
    <line x1="420" y1="70" x2="430" y2="80" stroke="black" stroke-width="3"/>
    <line x1="480" y1="70" x2="470" y2="80" stroke="black" stroke-width="3"/>
    <line x1="420" y1="130" x2="430" y2="120" stroke="black" stroke-width="3"/>
    <line x1="480" y1="130" x2="470" y2="120" stroke="black" stroke-width="3"/>
    <line x1="390" y1="100" x2="410" y2="100" stroke="black" stroke-width="3"/>
    <line x1="490" y1="100" x2="510" y2="100" stroke="black" stroke-width="3"/>
    <line x1="450" y1="40" x2="450" y2="60" stroke="black" stroke-width="3"/>
    <line x1="450" y1="140" x2="450" y2="160" stroke="black" stroke-width="3"/>
    
    <!-- Flower garden -->
    <circle cx="60" cy="340" r="8" fill="none" stroke="black" stroke-width="2"/>
    <ellipse cx="52" cy="332" rx="6" ry="10" fill="none" stroke="black" stroke-width="2"/>
    <ellipse cx="68" cy="332" rx="6" ry="10" fill="none" stroke="black" stroke-width="2"/>
    <ellipse cx="52" cy="348" rx="6" ry="10" fill="none" stroke="black" stroke-width="2"/>
    <ellipse cx="68" cy="348" rx="6" ry="10" fill="none" stroke="black" stroke-width="2"/>
    <line x1="60" y1="348" x2="60" y2="370" stroke="black" stroke-width="2"/>
    
    <circle cx="90" cy="350" r="6" fill="none" stroke="black" stroke-width="2"/>
    <ellipse cx="84" cy="344" rx="4" ry="8" fill="none" stroke="black" stroke-width="2"/>
    <ellipse cx="96" cy="344" rx="4" ry="8" fill="none" stroke="black" stroke-width="2"/>
    <ellipse cx="84" cy="356" rx="4" ry="8" fill="none" stroke="black" stroke-width="2"/>
    <ellipse cx="96" cy="356" rx="4" ry="8" fill="none" stroke="black" stroke-width="2"/>
    <line x1="90" y1="356" x2="90" y2="370" stroke="black" stroke-width="2"/>
    
    <!-- Fence -->
    <line x1="380" y1="320" x2="380" y2="370" stroke="black" stroke-width="3"/>
    <line x1="400" y1="320" x2="400" y2="370" stroke="black" stroke-width="3"/>
    <line x1="420" y1="320" x2="420" y2="370" stroke="black" stroke-width="3"/>
    <line x1="440" y1="320" x2="440" y2="370" stroke="black" stroke-width="3"/>
    <line x1="370" y1="340" x2="450" y2="340" stroke="black" stroke-width="2"/>
    <line x1="370" y1="355" x2="450" y2="355" stroke="black" stroke-width="2"/>
    
    <!-- Birds -->
    <path d="M 200 120 Q 210 115 220 120" fill="none" stroke="black" stroke-width="2"/>
    <path d="M 200 120 Q 210 125 220 120" fill="none" stroke="black" stroke-width="2"/>
    <path d="M 250 100 Q 260 95 270 100" fill="none" stroke="black" stroke-width="2"/>
    <path d="M 250 100 Q 260 105 270 100" fill="none" stroke="black" stroke-width="2"/>
    
    <!-- Ground/grass -->
    <path d="M 0 370 Q 100 365 200 370 Q 300 375 400 370 Q 450 365 512 370 L 512 512 L 0 512 Z" fill="none" stroke="black" stroke-width="2"/>
    <path d="M 50 370 Q 60 350 55 330" fill="none" stroke="black" stroke-width="2"/>
    <path d="M 150 370 Q 160 350 155 330" fill="none" stroke="black" stroke-width="2"/>
    <path d="M 250 370 Q 260 350 255 330" fill="none" stroke="black" stroke-width="2"/>
    <path d="M 350 370 Q 360 350 355 330" fill="none" stroke="black" stroke-width="2"/>
    <path d="M 450 370 Q 460 350 455 330" fill="none" stroke="black" stroke-width="2"/>
  </svg>`;
}