import puppeteer from 'puppeteer';
import fs from 'fs';

async function testParentProfileUI() {
  let browser;
  try {
    console.log('🚀 Starting UI test...');
    
    // Launch browser
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    await page.setViewport({ width: 1200, height: 800 });
    
    // Navigate to the application
    console.log('📱 Navigating to http://localhost:5000...');
    await page.goto('http://localhost:5000', { waitUntil: 'networkidle0' });
    
    // Take initial screenshot
    await page.screenshot({ path: 'app_homepage.png' });
    console.log('📸 Screenshot saved: app_homepage.png');
    
    // Check page title
    const title = await page.title();
    console.log('📰 Page title:', title);
    
    // Check for authentication elements
    const authElements = await page.evaluate(() => {
      const loginButton = document.querySelector('button:contains("Log In")') || 
                          document.querySelector('a[href*="login"]') ||
                          document.querySelector('[data-testid="login"]');
      const signupButton = document.querySelector('button:contains("Sign Up")') || 
                           document.querySelector('a[href*="signup"]') ||
                           document.querySelector('[data-testid="signup"]');
      
      return {
        hasLoginButton: !!loginButton,
        hasSignupButton: !!signupButton,
        loginButtonText: loginButton ? loginButton.textContent : null,
        signupButtonText: signupButton ? signupButton.textContent : null
      };
    });
    
    console.log('🔐 Auth elements found:', authElements);
    
    // Check for navigation elements
    const navElements = await page.evaluate(() => {
      const nav = document.querySelector('nav');
      const sidebar = document.querySelector('[role="navigation"]') || 
                     document.querySelector('.sidebar');
      const menuButton = document.querySelector('button[aria-label*="menu"]') ||
                         document.querySelector('[data-testid="menu-button"]');
      
      return {
        hasNav: !!nav,
        hasSidebar: !!sidebar,
        hasMenuButton: !!menuButton,
        navItems: nav ? Array.from(nav.querySelectorAll('a')).map(a => a.textContent) : []
      };
    });
    
    console.log('🧭 Navigation elements:', navElements);
    
    // Check for cart button
    const cartElements = await page.evaluate(() => {
      const cartButton = document.querySelector('[data-testid="cart-button"]') ||
                        document.querySelector('button:contains("Cart")') ||
                        document.querySelector('[aria-label*="cart"]');
      const cartBadge = document.querySelector('[data-testid="cart-badge"]') ||
                       document.querySelector('.cart-badge');
      
      return {
        hasCartButton: !!cartButton,
        hasCartBadge: !!cartBadge,
        cartBadgeText: cartBadge ? cartBadge.textContent : null
      };
    });
    
    console.log('🛒 Cart elements:', cartElements);
    
    // Check console logs for errors
    const consoleLogs = [];
    page.on('console', msg => {
      consoleLogs.push({ type: msg.type(), text: msg.text() });
    });
    
    // Wait a bit for any dynamic content to load
    await page.waitForTimeout(2000);
    
    // Check if authenticated user content is visible
    const userContent = await page.evaluate(() => {
      const userProfile = document.querySelector('[data-testid="user-profile"]');
      const dashboard = document.querySelector('[data-testid="dashboard"]');
      const parentContent = document.querySelector('[data-testid="parent-content"]');
      
      return {
        hasUserProfile: !!userProfile,
        hasDashboard: !!dashboard,
        hasParentContent: !!parentContent
      };
    });
    
    console.log('👤 User content:', userContent);
    
    // Test responsiveness
    await page.setViewport({ width: 768, height: 1024 });
    await page.screenshot({ path: 'app_tablet.png' });
    console.log('📱 Tablet screenshot saved: app_tablet.png');
    
    await page.setViewport({ width: 375, height: 667 });
    await page.screenshot({ path: 'app_mobile.png' });
    console.log('📱 Mobile screenshot saved: app_mobile.png');
    
    // Print console logs
    console.log('\n📋 Console logs:');
    consoleLogs.forEach(log => {
      console.log(`${log.type.toUpperCase()}: ${log.text}`);
    });
    
    console.log('\n✅ UI test completed successfully!');
    
  } catch (error) {
    console.error('❌ UI test failed:', error);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

// Run the test
testParentProfileUI();