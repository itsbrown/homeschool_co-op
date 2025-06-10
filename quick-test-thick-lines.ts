/**
 * Quick Test for Thick Line Coloring Pages
 * Validates current implementation status
 */

import fs from 'fs';
import path from 'path';

function analyzeExistingFiles(): void {
  console.log('📊 THICK LINE COLORING PAGE ANALYSIS');
  console.log('=====================================\n');
  
  const uploadsDir = path.join('uploads', 'activities');
  
  if (!fs.existsSync(uploadsDir)) {
    console.log('❌ Uploads directory not found');
    return;
  }
  
  const files = fs.readdirSync(uploadsDir)
    .filter(file => file.includes('professional_coloring') && file.endsWith('.svg'))
    .sort((a, b) => {
      const aTime = fs.statSync(path.join(uploadsDir, a)).mtime.getTime();
      const bTime = fs.statSync(path.join(uploadsDir, b)).mtime.getTime();
      return bTime - aTime; // Most recent first
    });
  
  if (files.length === 0) {
    console.log('❌ No professional coloring pages found');
    return;
  }
  
  console.log(`📁 Found ${files.length} professional coloring pages\n`);
  
  // Analyze recent files
  const recentFiles = files.slice(0, 5);
  
  for (const file of recentFiles) {
    const filepath = path.join(uploadsDir, file);
    const stats = fs.statSync(filepath);
    const content = fs.readFileSync(filepath, 'utf8');
    
    console.log(`📄 ${file}`);
    console.log(`   Size: ${(stats.size / 1024).toFixed(1)}KB`);
    console.log(`   Modified: ${stats.mtime.toLocaleString()}`);
    
    // Analyze content quality
    const hasStabilityAI = content.includes('data:image/png;base64,');
    const isHighQuality = stats.size > 100000;
    const hasColoringComment = content.includes('Professional') && content.includes('coloring page');
    
    console.log(`   Quality indicators:`);
    console.log(`     📸 Stability AI: ${hasStabilityAI ? '✅' : '❌'}`);
    console.log(`     📏 High quality: ${isHighQuality ? '✅' : '❌'}`);
    console.log(`     🎨 Proper format: ${hasColoringComment ? '✅' : '❌'}`);
    
    if (hasStabilityAI && isHighQuality) {
      console.log(`   🌟 EXCELLENT - Traditional thick lines`);
    } else if (hasStabilityAI) {
      console.log(`   ✅ GOOD - Using Stability AI`);
    } else {
      console.log(`   ⚠️  FALLBACK - Basic SVG generation`);
    }
    
    console.log('');
  }
  
  // Summary statistics
  const stabilityFiles = recentFiles.filter(file => {
    const content = fs.readFileSync(path.join(uploadsDir, file), 'utf8');
    return content.includes('data:image/png;base64,');
  });
  
  const highQualityFiles = recentFiles.filter(file => {
    const stats = fs.statSync(path.join(uploadsDir, file));
    return stats.size > 100000;
  });
  
  console.log('📊 SUMMARY');
  console.log('==========');
  console.log(`Total files analyzed: ${recentFiles.length}`);
  console.log(`Using Stability AI: ${stabilityFiles.length}/${recentFiles.length} (${(stabilityFiles.length/recentFiles.length*100).toFixed(1)}%)`);
  console.log(`High quality (>100KB): ${highQualityFiles.length}/${recentFiles.length} (${(highQualityFiles.length/recentFiles.length*100).toFixed(1)}%)`);
  
  const avgSize = recentFiles.reduce((sum, file) => {
    return sum + fs.statSync(path.join(uploadsDir, file)).size;
  }, 0) / recentFiles.length;
  
  console.log(`Average file size: ${(avgSize/1024).toFixed(1)}KB`);
  
  if (stabilityFiles.length === recentFiles.length && highQualityFiles.length === recentFiles.length) {
    console.log('\n🌟 STATUS: EXCELLENT - All files using thick line Stability AI generation');
  } else if (stabilityFiles.length >= recentFiles.length * 0.8) {
    console.log('\n✅ STATUS: GOOD - Most files using Stability AI');
  } else {
    console.log('\n⚠️  STATUS: MIXED - Some files still using fallback generation');
  }
}

analyzeExistingFiles();