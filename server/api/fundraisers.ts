import { Router } from 'express';
import { storage } from '../storage';
import { supabaseAuth } from '../middleware/supabase-auth';
import { requireSchoolContext } from '../middleware/require-school-context';
import { z } from 'zod';
import { getStripeClient } from '../config/stripe';
import path from 'path';
import fs from 'fs';
import { UploadedFile } from 'express-fileupload';

const router = Router();

// ==================== CAMPAIGN SCHEMAS ====================
const createCampaignSchema = z.object({
  name: z.string().min(1, "Campaign name is required"),
  description: z.string().nullable().default(null),
  startDate: z.string().transform((val) => new Date(val)),
  endDate: z.string().transform((val) => new Date(val)),
  isActive: z.boolean().optional().default(true),
});

const updateCampaignSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  startDate: z.string().transform((val) => new Date(val)).optional(),
  endDate: z.string().transform((val) => new Date(val)).optional(),
  isActive: z.boolean().optional(),
});

// ==================== PRODUCT SCHEMAS ====================
const createProductSchema = z.object({
  name: z.string().min(1, "Product name is required"),
  description: z.string().nullable().default(null),
  imageUrl: z.string().nullable().default(null),
  priceCents: z.number().int().positive("Price must be positive"),
  creditAmountCents: z.number().int().nonnegative("Credit amount must be non-negative"),
  stockQuantity: z.number().int().nullable().default(null),
  isActive: z.boolean().optional().default(true),
  sortOrder: z.number().int().optional().default(0),
});

const updateProductSchema = createProductSchema.partial();

// ==================== CHECKOUT SCHEMA ====================
const checkoutSchema = z.object({
  campaignId: z.number().int().positive(),
  familyLinkId: z.number().int().positive(),
  customer: z.object({
    customerName: z.string().min(1, "Name is required"),
    customerEmail: z.string().email("Valid email is required"),
    customerPhone: z.string().optional(),
  }),
  items: z.array(z.object({
    productId: z.number().int().positive(),
    name: z.string(),
    priceCents: z.number().int().positive(),
    quantity: z.number().int().positive(),
  })).min(1, "At least one item is required"),
});

// ==================== ADMIN CAMPAIGN ROUTES (require auth + school context) ====================

// Get all campaigns for school
router.get('/campaigns', supabaseAuth, requireSchoolContext, async (req: any, res) => {
  try {
    const schoolId = parseInt(req.schoolId);
    const campaigns = await storage.getFundraiserCampaignsBySchoolId(schoolId);
    res.json(campaigns);
  } catch (error: any) {
    console.error('Error fetching fundraiser campaigns:', error);
    res.status(500).json({ error: 'Failed to fetch campaigns' });
  }
});

// Get single campaign
router.get('/campaigns/:id', supabaseAuth, requireSchoolContext, async (req: any, res) => {
  try {
    const id = parseInt(req.params.id);
    const campaign = await storage.getFundraiserCampaignById(id);
    
    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }
    
    // Verify school access
    const schoolId = parseInt(req.schoolId);
    if (campaign.schoolId !== schoolId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    res.json(campaign);
  } catch (error: any) {
    console.error('Error fetching campaign:', error);
    res.status(500).json({ error: 'Failed to fetch campaign' });
  }
});

// Create campaign
router.post('/campaigns', supabaseAuth, requireSchoolContext, async (req: any, res) => {
  try {
    const schoolId = parseInt(req.schoolId);
    const parsed = createCampaignSchema.safeParse(req.body);
    
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid campaign data', details: parsed.error.errors });
    }
    
    const campaign = await storage.createFundraiserCampaign({
      ...parsed.data,
      schoolId,
    });
    
    res.status(201).json(campaign);
  } catch (error: any) {
    console.error('Error creating campaign:', error);
    res.status(500).json({ error: 'Failed to create campaign' });
  }
});

// Update campaign
router.patch('/campaigns/:id', supabaseAuth, requireSchoolContext, async (req: any, res) => {
  try {
    const id = parseInt(req.params.id);
    const schoolId = parseInt(req.schoolId);
    
    // Verify ownership
    const existing = await storage.getFundraiserCampaignById(id);
    if (!existing) {
      return res.status(404).json({ error: 'Campaign not found' });
    }
    if (existing.schoolId !== schoolId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const parsed = updateCampaignSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid campaign data', details: parsed.error.errors });
    }
    
    const updated = await storage.updateFundraiserCampaign(id, parsed.data);
    res.json(updated);
  } catch (error: any) {
    console.error('Error updating campaign:', error);
    res.status(500).json({ error: 'Failed to update campaign' });
  }
});

// Delete campaign
router.delete('/campaigns/:id', supabaseAuth, requireSchoolContext, async (req: any, res) => {
  try {
    const id = parseInt(req.params.id);
    const schoolId = parseInt(req.schoolId);
    
    // Verify ownership
    const existing = await storage.getFundraiserCampaignById(id);
    if (!existing) {
      return res.status(404).json({ error: 'Campaign not found' });
    }
    if (existing.schoolId !== schoolId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    await storage.deleteFundraiserCampaign(id);
    res.status(204).send();
  } catch (error: any) {
    console.error('Error deleting campaign:', error);
    res.status(500).json({ error: 'Failed to delete campaign' });
  }
});

// ==================== PRODUCT ROUTES ====================

// Get products for a campaign
router.get('/campaigns/:campaignId/products', supabaseAuth, requireSchoolContext, async (req: any, res) => {
  try {
    const campaignId = parseInt(req.params.campaignId);
    const schoolId = parseInt(req.schoolId);
    
    // Verify campaign ownership
    const campaign = await storage.getFundraiserCampaignById(campaignId);
    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }
    if (campaign.schoolId !== schoolId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const products = await storage.getFundraiserProductsByCampaignId(campaignId);
    res.json(products);
  } catch (error: any) {
    console.error('Error fetching products:', error);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

// Create product
router.post('/campaigns/:campaignId/products', supabaseAuth, requireSchoolContext, async (req: any, res) => {
  try {
    const campaignId = parseInt(req.params.campaignId);
    const schoolId = parseInt(req.schoolId);
    
    // Verify campaign ownership
    const campaign = await storage.getFundraiserCampaignById(campaignId);
    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }
    if (campaign.schoolId !== schoolId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const parsed = createProductSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid product data', details: parsed.error.errors });
    }
    
    const product = await storage.createFundraiserProduct({
      ...parsed.data,
      campaignId,
    });
    res.status(201).json(product);
  } catch (error: any) {
    console.error('Error creating product:', error);
    res.status(500).json({ error: 'Failed to create product' });
  }
});

// Update product
router.patch('/products/:id', supabaseAuth, requireSchoolContext, async (req: any, res) => {
  try {
    const id = parseInt(req.params.id);
    const schoolId = parseInt(req.schoolId);
    
    // Verify ownership through campaign
    const product = await storage.getFundraiserProductById(id);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }
    
    const campaign = await storage.getFundraiserCampaignById(product.campaignId);
    if (!campaign || campaign.schoolId !== schoolId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const parsed = updateProductSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid product data', details: parsed.error.errors });
    }
    
    const updated = await storage.updateFundraiserProduct(id, parsed.data);
    res.json(updated);
  } catch (error: any) {
    console.error('Error updating product:', error);
    res.status(500).json({ error: 'Failed to update product' });
  }
});

// Delete product
router.delete('/products/:id', supabaseAuth, requireSchoolContext, async (req: any, res) => {
  try {
    const id = parseInt(req.params.id);
    const schoolId = parseInt(req.schoolId);
    
    // Verify ownership through campaign
    const product = await storage.getFundraiserProductById(id);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }
    
    const campaign = await storage.getFundraiserCampaignById(product.campaignId);
    if (!campaign || campaign.schoolId !== schoolId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    await storage.deleteFundraiserProduct(id);
    res.status(204).send();
  } catch (error: any) {
    console.error('Error deleting product:', error);
    res.status(500).json({ error: 'Failed to delete product' });
  }
});

// ==================== FAMILY LINK ROUTES ====================

// Get family links for a campaign (admin view)
router.get('/campaigns/:campaignId/links', supabaseAuth, requireSchoolContext, async (req: any, res) => {
  try {
    const campaignId = parseInt(req.params.campaignId);
    const schoolId = parseInt(req.schoolId);
    
    // Verify campaign ownership
    const campaign = await storage.getFundraiserCampaignById(campaignId);
    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }
    if (campaign.schoolId !== schoolId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const links = await storage.getFundraiserFamilyLinksByCampaignId(campaignId);
    
    // Enrich with user info and sales data
    const enrichedLinks = await Promise.all(links.map(async (link) => {
      const user = await storage.getUser(link.userId);
      const orders = await storage.getFundraiserOrdersByFamilyLinkId(link.id);
      const paidOrders = orders.filter(o => o.status === 'paid' || o.status === 'fulfilled');
      
      const totalSalesCents = paidOrders.reduce((sum, o) => sum + o.totalCents, 0);
      const totalCreditsCents = paidOrders.reduce((sum, o) => sum + o.creditEarnedCents, 0);
      
      return {
        ...link,
        userName: user ? `${user.firstName} ${user.lastName}` : 'Unknown',
        userEmail: user?.email || '',
        orderCount: paidOrders.length,
        totalSalesCents,
        totalCreditsCents,
      };
    }));
    
    res.json(enrichedLinks);
  } catch (error: any) {
    console.error('Error fetching family links:', error);
    res.status(500).json({ error: 'Failed to fetch family links' });
  }
});

// Get or create family link for current user
router.post('/campaigns/:campaignId/my-link', supabaseAuth, requireSchoolContext, async (req: any, res) => {
  try {
    const campaignId = parseInt(req.params.campaignId);
    const userId = req.user.id;
    const schoolId = parseInt(req.schoolId);
    
    // Verify campaign is active and belongs to school
    const campaign = await storage.getFundraiserCampaignById(campaignId);
    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }
    if (campaign.schoolId !== schoolId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const user = await storage.getUser(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const userName = `${user.firstName} ${user.lastName}`;
    const link = await storage.getOrCreateFundraiserFamilyLink(campaignId, userId, userName);
    
    res.json(link);
  } catch (error: any) {
    console.error('Error getting/creating family link:', error);
    res.status(500).json({ error: 'Failed to get family link' });
  }
});

// Get my family links (for parent dashboard)
router.get('/my-links', supabaseAuth, async (req: any, res) => {
  try {
    const userId = req.user.id;
    const links = await storage.getFundraiserFamilyLinksByUserId(userId);
    
    // Enrich with campaign info and sales data
    const enrichedLinks = await Promise.all(links.map(async (link) => {
      const campaign = await storage.getFundraiserCampaignById(link.campaignId);
      const orders = await storage.getFundraiserOrdersByFamilyLinkId(link.id);
      const paidOrders = orders.filter(o => o.status === 'paid' || o.status === 'fulfilled');
      
      const totalSalesCents = paidOrders.reduce((sum, o) => sum + o.totalCents, 0);
      const totalCreditsCents = paidOrders.reduce((sum, o) => sum + o.creditEarnedCents, 0);
      
      return {
        ...link,
        campaign: campaign ? {
          id: campaign.id,
          name: campaign.name,
          isActive: campaign.isActive,
          startDate: campaign.startDate,
          endDate: campaign.endDate,
        } : null,
        orderCount: paidOrders.length,
        totalSalesCents,
        totalCreditsCents,
      };
    }));
    
    res.json(enrichedLinks);
  } catch (error: any) {
    console.error('Error fetching my family links:', error);
    res.status(500).json({ error: 'Failed to fetch family links' });
  }
});

// ==================== ORDER ROUTES ====================

// Get orders for a campaign (admin view)
router.get('/campaigns/:campaignId/orders', supabaseAuth, requireSchoolContext, async (req: any, res) => {
  try {
    const campaignId = parseInt(req.params.campaignId);
    const schoolId = parseInt(req.schoolId);
    
    // Verify campaign ownership
    const campaign = await storage.getFundraiserCampaignById(campaignId);
    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }
    if (campaign.schoolId !== schoolId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const orders = await storage.getFundraiserOrdersByCampaignId(campaignId);
    
    // Enrich with items and seller info
    const enrichedOrders = await Promise.all(orders.map(async (order) => {
      const items = await storage.getFundraiserOrderItemsByOrderId(order.id);
      let sellerName = 'Unknown';
      
      if (order.familyLinkId) {
        const familyLink = await storage.getFundraiserFamilyLinkById(order.familyLinkId);
        if (familyLink) {
          const user = await storage.getUser(familyLink.userId);
          if (user) {
            sellerName = `${user.firstName} ${user.lastName}`;
          }
        }
      }
      
      return {
        ...order,
        items,
        sellerName,
      };
    }));
    
    res.json(enrichedOrders);
  } catch (error: any) {
    console.error('Error fetching orders:', error);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

// ==================== PUBLIC STOREFRONT ROUTES (no auth required) ====================

// Get public campaign info by school slug and campaign slug
router.get('/public/:schoolId/:campaignId', async (req, res) => {
  try {
    const campaignId = parseInt(req.params.campaignId);
    
    const campaign = await storage.getFundraiserCampaignById(campaignId);
    if (!campaign || !campaign.isActive) {
      return res.status(404).json({ error: 'Campaign not found or not active' });
    }
    
    // Check if campaign is within date range
    const now = new Date();
    if (campaign.startDate > now || campaign.endDate < now) {
      return res.status(404).json({ error: 'Campaign is not currently active' });
    }
    
    const products = await storage.getFundraiserProductsByCampaignId(campaignId);
    const activeProducts = products.filter(p => p.isActive);
    
    res.json({
      campaign: {
        id: campaign.id,
        name: campaign.name,
        description: campaign.description,
        endDate: campaign.endDate,
      },
      products: activeProducts.map(p => ({
        id: p.id,
        name: p.name,
        description: p.description,
        priceCents: p.priceCents,
        imageUrl: p.imageUrl,
      })),
    });
  } catch (error: any) {
    console.error('Error fetching public campaign:', error);
    res.status(500).json({ error: 'Failed to fetch campaign' });
  }
});

// Get public storefront by family link slug
router.get('/store/:campaignId/:familySlug', async (req, res) => {
  try {
    const campaignId = parseInt(req.params.campaignId);
    const familySlug = req.params.familySlug;
    
    const campaign = await storage.getFundraiserCampaignById(campaignId);
    if (!campaign || !campaign.isActive) {
      return res.status(404).json({ error: 'Campaign not found or not active' });
    }
    
    // Check if campaign is within date range
    const now = new Date();
    if (campaign.startDate > now || campaign.endDate < now) {
      return res.status(404).json({ error: 'Campaign is not currently active' });
    }
    
    const familyLink = await storage.getFundraiserFamilyLinkBySlug(campaignId, familySlug);
    if (!familyLink) {
      return res.status(404).json({ error: 'Family link not found' });
    }
    
    const seller = await storage.getUser(familyLink.userId);
    const products = await storage.getFundraiserProductsByCampaignId(campaignId);
    const activeProducts = products.filter(p => p.isActive);
    
    res.json({
      campaign: {
        id: campaign.id,
        name: campaign.name,
        description: campaign.description,
        endDate: campaign.endDate,
      },
      seller: {
        name: seller ? `${seller.firstName} ${seller.lastName}` : 'Unknown',
        familyLinkId: familyLink.id,
      },
      products: activeProducts.map(p => ({
        id: p.id,
        name: p.name,
        description: p.description,
        priceCents: p.priceCents,
        imageUrl: p.imageUrl,
      })),
    });
  } catch (error: any) {
    console.error('Error fetching public store:', error);
    res.status(500).json({ error: 'Failed to fetch store' });
  }
});

// ==================== PUBLIC CHECKOUT ROUTE (no auth) ====================
router.post('/checkout', async (req, res) => {
  try {
    const parsed = checkoutSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid checkout data', details: parsed.error.errors });
    }

    const { campaignId, familyLinkId, customer, items } = parsed.data;

    // Validate campaign exists and is active
    const campaign = await storage.getFundraiserCampaignById(campaignId);
    if (!campaign || !campaign.isActive) {
      return res.status(404).json({ error: 'Campaign not found or not active' });
    }

    // Check date range
    const now = new Date();
    if (campaign.startDate > now || campaign.endDate < now) {
      return res.status(400).json({ error: 'Campaign is not currently active' });
    }

    // Validate family link
    const familyLink = await storage.getFundraiserFamilyLinkById(familyLinkId);
    if (!familyLink || familyLink.campaignId !== campaignId) {
      return res.status(400).json({ error: 'Invalid family link' });
    }

    // Server-side price validation - NEVER trust client prices
    const products = await storage.getFundraiserProductsByCampaignId(campaignId);
    const productMap = new Map(products.map(p => [p.id, p]));
    
    let serverTotal = 0;
    let totalCreditEarned = 0;
    const validatedItems: { productId: number; quantity: number; unitPriceCents: number; creditAmountCents: number }[] = [];

    for (const item of items) {
      const product = productMap.get(item.productId);
      if (!product || !product.isActive) {
        return res.status(400).json({ error: `Product ${item.productId} is not available` });
      }
      
      // Use server-side pricing, not client-side
      const itemTotal = product.priceCents * item.quantity;
      serverTotal += itemTotal;
      totalCreditEarned += product.creditAmountCents * item.quantity;
      
      validatedItems.push({
        productId: item.productId,
        quantity: item.quantity,
        unitPriceCents: product.priceCents,
        creditAmountCents: product.creditAmountCents,
      });
    }

    const stripe = await getStripeClient();

    // Create Stripe Checkout Session
    const lineItems = validatedItems.map(item => {
      const product = productMap.get(item.productId)!;
      return {
        price_data: {
          currency: 'usd',
          product_data: {
            name: product.name,
            description: product.description || undefined,
          },
          unit_amount: item.unitPriceCents,
        },
        quantity: item.quantity,
      };
    });

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      line_items: lineItems,
      customer_email: customer.customerEmail,
      success_url: `${req.protocol}://${req.get('host')}/fundraiser/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${req.protocol}://${req.get('host')}/fundraiser/${campaignId}/${familyLink.uniqueSlug}`,
      metadata: {
        type: 'fundraiser_order',
        campaignId: campaignId.toString(),
        familyLinkId: familyLinkId.toString(),
        userId: familyLink.userId.toString(),
        customerName: customer.customerName,
        customerEmail: customer.customerEmail,
        customerPhone: customer.customerPhone || '',
        totalCents: serverTotal.toString(),
        creditEarnedCents: totalCreditEarned.toString(),
        items: JSON.stringify(validatedItems),
      },
    });

    res.json({ checkoutUrl: session.url });
  } catch (error: any) {
    console.error('Error creating checkout session:', error);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

// ==================== PARENT ROUTES (require auth, no school context needed) ====================

// Get parent's active fundraiser links
router.get('/my-links', supabaseAuth, async (req: any, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const familyLinks = await storage.getFundraiserFamilyLinksByUserId(userId);
    
    // Enhance with campaign data and stats
    const enhancedLinks = await Promise.all(familyLinks.map(async (link) => {
      const campaign = await storage.getFundraiserCampaignById(link.campaignId);
      const orders = await storage.getFundraiserOrdersByFamilyLinkId(link.id);
      
      const totalSales = orders.reduce((sum, o) => sum + o.totalCents, 0);
      const totalCredits = orders.reduce((sum, o) => sum + o.creditEarnedCents, 0);
      const orderCount = orders.length;
      
      // Check if campaign is active
      const now = new Date();
      const isActive = campaign && 
        campaign.isActive && 
        campaign.startDate <= now && 
        campaign.endDate >= now;
      
      return {
        id: link.id,
        campaignId: link.campaignId,
        slug: link.slug,
        campaignName: campaign?.name || 'Unknown Campaign',
        campaignDescription: campaign?.description,
        campaignEndDate: campaign?.endDate,
        isActive,
        storeUrl: `/fundraiser/${link.campaignId}/${link.slug}`,
        totalSalesCents: totalSales,
        totalCreditsEarnedCents: totalCredits,
        orderCount,
        createdAt: link.createdAt,
      };
    }));
    
    res.json(enhancedLinks);
  } catch (error: any) {
    console.error('Error fetching parent fundraiser links:', error);
    res.status(500).json({ error: 'Failed to fetch fundraiser links' });
  }
});

// Get parent's fundraiser order history
router.get('/my-orders', supabaseAuth, async (req: any, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    // Get all family links for this user
    const familyLinks = await storage.getFundraiserFamilyLinksByUserId(userId);
    
    // Get orders for all their links
    const allOrders = [];
    for (const link of familyLinks) {
      const orders = await storage.getFundraiserOrdersByFamilyLinkId(link.id);
      const campaign = await storage.getFundraiserCampaignById(link.campaignId);
      
      for (const order of orders) {
        const items = await storage.getFundraiserOrderItemsByOrderId(order.id);
        allOrders.push({
          ...order,
          campaignName: campaign?.name || 'Unknown Campaign',
          itemCount: items.reduce((sum, i) => sum + i.quantity, 0),
        });
      }
    }
    
    // Sort by most recent first
    allOrders.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    
    res.json(allOrders);
  } catch (error: any) {
    console.error('Error fetching parent fundraiser orders:', error);
    res.status(500).json({ error: 'Failed to fetch fundraiser orders' });
  }
});

// Get parent's fundraiser credits summary
router.get('/my-credits', supabaseAuth, async (req: any, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    // Get all credits of type 'fundraiser' for this user
    const credits = await storage.getCredits({ userId, creditType: 'fundraiser' });
    
    const totalEarnedCents = credits.reduce((sum, c) => sum + c.creditAmountCents, 0);
    const totalUsedCents = credits.reduce((sum, c) => sum + (c.usedAmountCents || 0), 0);
    const availableCents = totalEarnedCents - totalUsedCents;
    
    res.json({
      totalEarnedCents,
      totalUsedCents,
      availableCents,
      credits: credits.map(c => ({
        id: c.id,
        amountCents: c.creditAmountCents,
        usedCents: c.usedAmountCents || 0,
        status: c.status,
        title: c.title,
        notes: c.notes,
        createdAt: c.createdAt,
      })),
    });
  } catch (error: any) {
    console.error('Error fetching parent fundraiser credits:', error);
    res.status(500).json({ error: 'Failed to fetch fundraiser credits' });
  }
});

// ==================== PRODUCT IMAGE UPLOAD ====================

// Upload product image
router.post('/upload/product-image', supabaseAuth, async (req: any, res) => {
  try {
    // Check for uploaded file
    if (!req.files || !req.files.image) {
      return res.status(400).json({ 
        success: false, 
        message: 'No image file uploaded' 
      });
    }
    
    const imageFile = req.files.image as UploadedFile;
    
    // Validate file type (images only)
    const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedMimeTypes.includes(imageFile.mimetype)) {
      return res.status(400).json({
        success: false,
        message: 'Only image files are allowed (JPEG, PNG, GIF, WebP)'
      });
    }
    
    // Validate file size (5MB limit)
    const maxSize = 5 * 1024 * 1024;
    if (imageFile.size > maxSize) {
      return res.status(400).json({
        success: false,
        message: 'File too large. Maximum size is 5MB.'
      });
    }
    
    // Create uploads directory if it doesn't exist
    const uploadDir = path.join(process.cwd(), 'uploads', 'fundraiser-products');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    
    // Generate unique filename with sanitization
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    const ext = path.extname(imageFile.name).toLowerCase();
    const filename = `product-${timestamp}-${randomSuffix}${ext}`;
    const filepath = path.join(uploadDir, filename);
    
    // Save the file
    await imageFile.mv(filepath);
    
    // Generate the URL for the uploaded file
    const imageUrl = `/uploads/fundraiser-products/${filename}`;
    
    console.log('📸 Fundraiser product image uploaded:', filename);
    
    res.json({
      success: true,
      imageUrl,
      filename,
      size: imageFile.size,
      mimetype: imageFile.mimetype
    });
  } catch (error: any) {
    console.error('Error uploading fundraiser product image:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to upload image',
      error: error.message
    });
  }
});

// Delete product image
router.delete('/upload/product-image', supabaseAuth, async (req: any, res) => {
  try {
    const { imageUrl } = req.body;
    
    if (!imageUrl || !imageUrl.startsWith('/uploads/fundraiser-products/')) {
      return res.status(400).json({
        success: false,
        message: 'Invalid image URL'
      });
    }
    
    const filename = path.basename(imageUrl);
    const filepath = path.join(process.cwd(), 'uploads', 'fundraiser-products', filename);
    
    if (fs.existsSync(filepath)) {
      fs.unlinkSync(filepath);
      console.log('🗑️ Fundraiser product image deleted:', filename);
    }
    
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting fundraiser product image:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete image'
    });
  }
});

export default router;
