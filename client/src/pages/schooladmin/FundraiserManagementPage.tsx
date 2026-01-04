import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { 
  Plus, 
  Loader2,
  DollarSign,
  Calendar,
  Package,
  Link2,
  ShoppingCart,
  Edit,
  Trash2,
  Eye,
  Copy
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import SchoolAdminLayout from '@/components/layout/SchoolAdminLayout';
import { format } from 'date-fns';

interface FundraiserCampaign {
  id: number;
  schoolId: number;
  name: string;
  description: string | null;
  startDate: string;
  endDate: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface FundraiserProduct {
  id: number;
  campaignId: number;
  name: string;
  description: string | null;
  imageUrl: string | null;
  priceCents: number;
  creditAmountCents: number;
  stockQuantity: number | null;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

interface FamilyLink {
  id: number;
  campaignId: number;
  userId: number;
  slug: string;
  userName: string;
  userEmail: string;
  orderCount: number;
  totalSalesCents: number;
  totalCreditsCents: number;
  createdAt: string;
}

interface FundraiserOrder {
  id: number;
  campaignId: number;
  customerName: string;
  customerEmail: string;
  totalCents: number;
  creditEarnedCents: number;
  status: string;
  sellerName: string;
  createdAt: string;
  items: {
    id: number;
    productId: number;
    quantity: number;
    priceCents: number;
    creditAmountCents: number;
  }[];
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDate(dateStr: string): string {
  return format(new Date(dateStr), 'MMM d, yyyy');
}

export default function FundraiserManagementPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [activeTab, setActiveTab] = useState('campaigns');
  const [selectedCampaign, setSelectedCampaign] = useState<FundraiserCampaign | null>(null);
  const [isCreateCampaignOpen, setIsCreateCampaignOpen] = useState(false);
  const [isEditCampaignOpen, setIsEditCampaignOpen] = useState(false);
  const [isCreateProductOpen, setIsCreateProductOpen] = useState(false);
  const [isEditProductOpen, setIsEditProductOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<FundraiserProduct | null>(null);
  
  const [campaignForm, setCampaignForm] = useState({
    name: '',
    description: '',
    startDate: '',
    endDate: '',
    isActive: true,
  });
  
  const [productForm, setProductForm] = useState({
    name: '',
    description: '',
    imageUrl: '',
    priceDollars: '',
    creditAmountDollars: '',
    stockQuantity: '',
    isActive: true,
  });

  const { data: campaigns, isLoading: campaignsLoading } = useQuery<FundraiserCampaign[]>({
    queryKey: ['/api/fundraisers/campaigns'],
  });

  const { data: products, isLoading: productsLoading } = useQuery<FundraiserProduct[]>({
    queryKey: ['/api/fundraisers/campaigns', selectedCampaign?.id, 'products'],
    enabled: !!selectedCampaign,
  });

  const { data: familyLinks, isLoading: linksLoading } = useQuery<FamilyLink[]>({
    queryKey: ['/api/fundraisers/campaigns', selectedCampaign?.id, 'links'],
    enabled: !!selectedCampaign,
  });

  const { data: orders, isLoading: ordersLoading } = useQuery<FundraiserOrder[]>({
    queryKey: ['/api/fundraisers/campaigns', selectedCampaign?.id, 'orders'],
    enabled: !!selectedCampaign,
  });

  const createCampaignMutation = useMutation({
    mutationFn: async (data: typeof campaignForm) => {
      return apiRequest('POST', '/api/fundraisers/campaigns', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/fundraisers/campaigns'] });
      setIsCreateCampaignOpen(false);
      resetCampaignForm();
      toast({ title: 'Campaign created successfully' });
    },
    onError: (error: any) => {
      toast({ title: 'Failed to create campaign', description: error.message, variant: 'destructive' });
    },
  });

  const updateCampaignMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<typeof campaignForm> }) => {
      return apiRequest('PATCH', `/api/fundraisers/campaigns/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/fundraisers/campaigns'] });
      setIsEditCampaignOpen(false);
      toast({ title: 'Campaign updated successfully' });
    },
    onError: (error: any) => {
      toast({ title: 'Failed to update campaign', description: error.message, variant: 'destructive' });
    },
  });

  const deleteCampaignMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest('DELETE', `/api/fundraisers/campaigns/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/fundraisers/campaigns'] });
      setSelectedCampaign(null);
      toast({ title: 'Campaign deleted successfully' });
    },
    onError: (error: any) => {
      toast({ title: 'Failed to delete campaign', description: error.message, variant: 'destructive' });
    },
  });

  const createProductMutation = useMutation({
    mutationFn: async (data: { campaignId: number; product: typeof productForm }) => {
      const { campaignId, product } = data;
      return apiRequest('POST', `/api/fundraisers/campaigns/${campaignId}/products`, {
        name: product.name,
        description: product.description || null,
        imageUrl: product.imageUrl || null,
        priceCents: Math.round(parseFloat(product.priceDollars) * 100),
        creditAmountCents: Math.round(parseFloat(product.creditAmountDollars) * 100),
        stockQuantity: product.stockQuantity ? parseInt(product.stockQuantity) : null,
        isActive: product.isActive,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/fundraisers/campaigns', selectedCampaign?.id, 'products'] });
      setIsCreateProductOpen(false);
      resetProductForm();
      toast({ title: 'Product created successfully' });
    },
    onError: (error: any) => {
      toast({ title: 'Failed to create product', description: error.message, variant: 'destructive' });
    },
  });

  const updateProductMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: typeof productForm }) => {
      return apiRequest('PATCH', `/api/fundraisers/products/${id}`, {
        name: data.name,
        description: data.description || null,
        imageUrl: data.imageUrl || null,
        priceCents: Math.round(parseFloat(data.priceDollars) * 100),
        creditAmountCents: Math.round(parseFloat(data.creditAmountDollars) * 100),
        stockQuantity: data.stockQuantity ? parseInt(data.stockQuantity) : null,
        isActive: data.isActive,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/fundraisers/campaigns', selectedCampaign?.id, 'products'] });
      setIsEditProductOpen(false);
      toast({ title: 'Product updated successfully' });
    },
    onError: (error: any) => {
      toast({ title: 'Failed to update product', description: error.message, variant: 'destructive' });
    },
  });

  const deleteProductMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest('DELETE', `/api/fundraisers/products/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/fundraisers/campaigns', selectedCampaign?.id, 'products'] });
      toast({ title: 'Product deleted successfully' });
    },
    onError: (error: any) => {
      toast({ title: 'Failed to delete product', description: error.message, variant: 'destructive' });
    },
  });

  function resetCampaignForm() {
    setCampaignForm({ name: '', description: '', startDate: '', endDate: '', isActive: true });
  }

  function resetProductForm() {
    setProductForm({ name: '', description: '', imageUrl: '', priceDollars: '', creditAmountDollars: '', stockQuantity: '', isActive: true });
  }

  function handleEditCampaign(campaign: FundraiserCampaign) {
    setCampaignForm({
      name: campaign.name,
      description: campaign.description || '',
      startDate: format(new Date(campaign.startDate), 'yyyy-MM-dd'),
      endDate: format(new Date(campaign.endDate), 'yyyy-MM-dd'),
      isActive: campaign.isActive,
    });
    setSelectedCampaign(campaign);
    setIsEditCampaignOpen(true);
  }

  function handleEditProduct(product: FundraiserProduct) {
    setProductForm({
      name: product.name,
      description: product.description || '',
      imageUrl: product.imageUrl || '',
      priceDollars: (product.priceCents / 100).toFixed(2),
      creditAmountDollars: (product.creditAmountCents / 100).toFixed(2),
      stockQuantity: product.stockQuantity?.toString() || '',
      isActive: product.isActive,
    });
    setSelectedProduct(product);
    setIsEditProductOpen(true);
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
    toast({ title: 'Copied to clipboard' });
  }

  const campaignStats = selectedCampaign && orders && familyLinks ? {
    totalSales: orders.reduce((sum, o) => sum + o.totalCents, 0),
    totalCredits: orders.reduce((sum, o) => sum + o.creditEarnedCents, 0),
    totalOrders: orders.length,
    totalSellers: familyLinks.length,
  } : null;

  return (
    <SchoolAdminLayout pageTitle="Fundraiser Management">
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold" data-testid="page-title">Fundraiser Management</h1>
            <p className="text-muted-foreground mt-1">Create and manage fundraising campaigns</p>
          </div>
          <Button onClick={() => setIsCreateCampaignOpen(true)} data-testid="button-create-campaign">
            <Plus className="h-4 w-4 mr-2" />
            New Campaign
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <Card className="lg:col-span-1">
            <CardHeader>
              <CardTitle className="text-lg">Campaigns</CardTitle>
            </CardHeader>
            <CardContent>
              {campaignsLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
              ) : campaigns?.length === 0 ? (
                <p className="text-sm text-muted-foreground">No campaigns yet. Create your first one!</p>
              ) : (
                <div className="space-y-2">
                  {campaigns?.map((campaign) => (
                    <div
                      key={campaign.id}
                      onClick={() => setSelectedCampaign(campaign)}
                      className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                        selectedCampaign?.id === campaign.id ? 'bg-primary/10 border-primary' : 'hover:bg-muted'
                      }`}
                      data-testid={`campaign-item-${campaign.id}`}
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-medium text-sm">{campaign.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatDate(campaign.startDate)} - {formatDate(campaign.endDate)}
                          </p>
                        </div>
                        <Badge variant={campaign.isActive ? 'default' : 'secondary'} className="text-xs">
                          {campaign.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <div className="lg:col-span-3">
            {!selectedCampaign ? (
              <Card className="h-full flex items-center justify-center">
                <CardContent className="text-center py-12">
                  <Calendar className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">Select a campaign to view details</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-6">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                      <CardTitle data-testid="campaign-name">{selectedCampaign.name}</CardTitle>
                      <CardDescription>{selectedCampaign.description}</CardDescription>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => handleEditCampaign(selectedCampaign)} data-testid="button-edit-campaign">
                        <Edit className="h-4 w-4 mr-1" />
                        Edit
                      </Button>
                      <Button variant="destructive" size="sm" onClick={() => deleteCampaignMutation.mutate(selectedCampaign.id)} data-testid="button-delete-campaign">
                        <Trash2 className="h-4 w-4 mr-1" />
                        Delete
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {campaignStats && (
                      <div className="grid grid-cols-4 gap-4">
                        <div className="text-center p-4 bg-muted rounded-lg">
                          <p className="text-2xl font-bold" data-testid="stat-total-sales">{formatCents(campaignStats.totalSales)}</p>
                          <p className="text-sm text-muted-foreground">Total Sales</p>
                        </div>
                        <div className="text-center p-4 bg-muted rounded-lg">
                          <p className="text-2xl font-bold" data-testid="stat-total-credits">{formatCents(campaignStats.totalCredits)}</p>
                          <p className="text-sm text-muted-foreground">Credits Earned</p>
                        </div>
                        <div className="text-center p-4 bg-muted rounded-lg">
                          <p className="text-2xl font-bold" data-testid="stat-total-orders">{campaignStats.totalOrders}</p>
                          <p className="text-sm text-muted-foreground">Orders</p>
                        </div>
                        <div className="text-center p-4 bg-muted rounded-lg">
                          <p className="text-2xl font-bold" data-testid="stat-total-sellers">{campaignStats.totalSellers}</p>
                          <p className="text-sm text-muted-foreground">Active Sellers</p>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Tabs value={activeTab} onValueChange={setActiveTab}>
                  <TabsList>
                    <TabsTrigger value="products" data-testid="tab-products">
                      <Package className="h-4 w-4 mr-2" />
                      Products
                    </TabsTrigger>
                    <TabsTrigger value="sellers" data-testid="tab-sellers">
                      <Link2 className="h-4 w-4 mr-2" />
                      Sellers
                    </TabsTrigger>
                    <TabsTrigger value="orders" data-testid="tab-orders">
                      <ShoppingCart className="h-4 w-4 mr-2" />
                      Orders
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="products" className="mt-4">
                    <Card>
                      <CardHeader className="flex flex-row items-center justify-between">
                        <CardTitle className="text-lg">Products</CardTitle>
                        <Button size="sm" onClick={() => setIsCreateProductOpen(true)} data-testid="button-add-product">
                          <Plus className="h-4 w-4 mr-1" />
                          Add Product
                        </Button>
                      </CardHeader>
                      <CardContent>
                        {productsLoading ? (
                          <Skeleton className="h-32 w-full" />
                        ) : products?.length === 0 ? (
                          <p className="text-center text-muted-foreground py-8">No products yet</p>
                        ) : (
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Product</TableHead>
                                <TableHead>Price</TableHead>
                                <TableHead>Credit Amount</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Actions</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {products?.map((product) => (
                                <TableRow key={product.id} data-testid={`product-row-${product.id}`}>
                                  <TableCell>
                                    <div>
                                      <p className="font-medium">{product.name}</p>
                                      <p className="text-xs text-muted-foreground">{product.description}</p>
                                    </div>
                                  </TableCell>
                                  <TableCell>{formatCents(product.priceCents)}</TableCell>
                                  <TableCell>{formatCents(product.creditAmountCents)}</TableCell>
                                  <TableCell>
                                    <Badge variant={product.isActive ? 'default' : 'secondary'}>
                                      {product.isActive ? 'Active' : 'Inactive'}
                                    </Badge>
                                  </TableCell>
                                  <TableCell>
                                    <div className="flex gap-1">
                                      <Button variant="ghost" size="sm" onClick={() => handleEditProduct(product)} data-testid={`button-edit-product-${product.id}`}>
                                        <Edit className="h-4 w-4" />
                                      </Button>
                                      <Button variant="ghost" size="sm" onClick={() => deleteProductMutation.mutate(product.id)} data-testid={`button-delete-product-${product.id}`}>
                                        <Trash2 className="h-4 w-4" />
                                      </Button>
                                    </div>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        )}
                      </CardContent>
                    </Card>
                  </TabsContent>

                  <TabsContent value="sellers" className="mt-4">
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-lg">Family Sellers</CardTitle>
                        <CardDescription>View families participating in this fundraiser</CardDescription>
                      </CardHeader>
                      <CardContent>
                        {linksLoading ? (
                          <Skeleton className="h-32 w-full" />
                        ) : familyLinks?.length === 0 ? (
                          <p className="text-center text-muted-foreground py-8">No sellers have joined yet</p>
                        ) : (
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Seller</TableHead>
                                <TableHead>Link</TableHead>
                                <TableHead>Orders</TableHead>
                                <TableHead>Sales</TableHead>
                                <TableHead>Credits Earned</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {familyLinks?.map((link) => (
                                <TableRow key={link.id} data-testid={`seller-row-${link.id}`}>
                                  <TableCell>
                                    <div>
                                      <p className="font-medium">{link.userName}</p>
                                      <p className="text-xs text-muted-foreground">{link.userEmail}</p>
                                    </div>
                                  </TableCell>
                                  <TableCell>
                                    <Button variant="ghost" size="sm" onClick={() => copyToClipboard(`${window.location.origin}/fundraiser/${selectedCampaign.id}/${link.slug}`)}>
                                      <Copy className="h-4 w-4 mr-1" />
                                      Copy Link
                                    </Button>
                                  </TableCell>
                                  <TableCell>{link.orderCount}</TableCell>
                                  <TableCell>{formatCents(link.totalSalesCents)}</TableCell>
                                  <TableCell>{formatCents(link.totalCreditsCents)}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        )}
                      </CardContent>
                    </Card>
                  </TabsContent>

                  <TabsContent value="orders" className="mt-4">
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-lg">Orders</CardTitle>
                        <CardDescription>All orders for this campaign</CardDescription>
                      </CardHeader>
                      <CardContent>
                        {ordersLoading ? (
                          <Skeleton className="h-32 w-full" />
                        ) : orders?.length === 0 ? (
                          <p className="text-center text-muted-foreground py-8">No orders yet</p>
                        ) : (
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Customer</TableHead>
                                <TableHead>Seller</TableHead>
                                <TableHead>Total</TableHead>
                                <TableHead>Credit</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Date</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {orders?.map((order) => (
                                <TableRow key={order.id} data-testid={`order-row-${order.id}`}>
                                  <TableCell>
                                    <div>
                                      <p className="font-medium">{order.customerName}</p>
                                      <p className="text-xs text-muted-foreground">{order.customerEmail}</p>
                                    </div>
                                  </TableCell>
                                  <TableCell>{order.sellerName}</TableCell>
                                  <TableCell>{formatCents(order.totalCents)}</TableCell>
                                  <TableCell>{formatCents(order.creditEarnedCents)}</TableCell>
                                  <TableCell>
                                    <Badge variant={order.status === 'paid' || order.status === 'fulfilled' ? 'default' : 'secondary'}>
                                      {order.status}
                                    </Badge>
                                  </TableCell>
                                  <TableCell>{formatDate(order.createdAt)}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        )}
                      </CardContent>
                    </Card>
                  </TabsContent>
                </Tabs>
              </div>
            )}
          </div>
        </div>
      </div>

      <Dialog open={isCreateCampaignOpen} onOpenChange={setIsCreateCampaignOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Campaign</DialogTitle>
            <DialogDescription>Set up a new fundraising campaign for families to participate in.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="campaign-name">Campaign Name</Label>
              <Input
                id="campaign-name"
                value={campaignForm.name}
                onChange={(e) => setCampaignForm({ ...campaignForm, name: e.target.value })}
                placeholder="e.g., Spring Cookie Dough Fundraiser"
                data-testid="input-campaign-name"
              />
            </div>
            <div>
              <Label htmlFor="campaign-description">Description</Label>
              <Textarea
                id="campaign-description"
                value={campaignForm.description}
                onChange={(e) => setCampaignForm({ ...campaignForm, description: e.target.value })}
                placeholder="Describe the fundraiser..."
                data-testid="input-campaign-description"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="start-date">Start Date</Label>
                <Input
                  id="start-date"
                  type="date"
                  value={campaignForm.startDate}
                  onChange={(e) => setCampaignForm({ ...campaignForm, startDate: e.target.value })}
                  data-testid="input-campaign-start-date"
                />
              </div>
              <div>
                <Label htmlFor="end-date">End Date</Label>
                <Input
                  id="end-date"
                  type="date"
                  value={campaignForm.endDate}
                  onChange={(e) => setCampaignForm({ ...campaignForm, endDate: e.target.value })}
                  data-testid="input-campaign-end-date"
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={campaignForm.isActive}
                onCheckedChange={(checked) => setCampaignForm({ ...campaignForm, isActive: checked })}
                data-testid="switch-campaign-active"
              />
              <Label>Active</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateCampaignOpen(false)}>Cancel</Button>
            <Button 
              onClick={() => createCampaignMutation.mutate(campaignForm)} 
              disabled={createCampaignMutation.isPending || !campaignForm.name || !campaignForm.startDate || !campaignForm.endDate}
              data-testid="button-submit-campaign"
            >
              {createCampaignMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create Campaign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isEditCampaignOpen} onOpenChange={setIsEditCampaignOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Campaign</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="edit-campaign-name">Campaign Name</Label>
              <Input
                id="edit-campaign-name"
                value={campaignForm.name}
                onChange={(e) => setCampaignForm({ ...campaignForm, name: e.target.value })}
                data-testid="input-edit-campaign-name"
              />
            </div>
            <div>
              <Label htmlFor="edit-campaign-description">Description</Label>
              <Textarea
                id="edit-campaign-description"
                value={campaignForm.description}
                onChange={(e) => setCampaignForm({ ...campaignForm, description: e.target.value })}
                data-testid="input-edit-campaign-description"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="edit-start-date">Start Date</Label>
                <Input
                  id="edit-start-date"
                  type="date"
                  value={campaignForm.startDate}
                  onChange={(e) => setCampaignForm({ ...campaignForm, startDate: e.target.value })}
                  data-testid="input-edit-campaign-start-date"
                />
              </div>
              <div>
                <Label htmlFor="edit-end-date">End Date</Label>
                <Input
                  id="edit-end-date"
                  type="date"
                  value={campaignForm.endDate}
                  onChange={(e) => setCampaignForm({ ...campaignForm, endDate: e.target.value })}
                  data-testid="input-edit-campaign-end-date"
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={campaignForm.isActive}
                onCheckedChange={(checked) => setCampaignForm({ ...campaignForm, isActive: checked })}
                data-testid="switch-edit-campaign-active"
              />
              <Label>Active</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditCampaignOpen(false)}>Cancel</Button>
            <Button 
              onClick={() => selectedCampaign && updateCampaignMutation.mutate({ id: selectedCampaign.id, data: campaignForm })} 
              disabled={updateCampaignMutation.isPending}
              data-testid="button-save-campaign"
            >
              {updateCampaignMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isCreateProductOpen} onOpenChange={setIsCreateProductOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Product</DialogTitle>
            <DialogDescription>Add a product that families can sell.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="product-name">Product Name</Label>
              <Input
                id="product-name"
                value={productForm.name}
                onChange={(e) => setProductForm({ ...productForm, name: e.target.value })}
                placeholder="e.g., Chocolate Chip Cookie Dough"
                data-testid="input-product-name"
              />
            </div>
            <div>
              <Label htmlFor="product-description">Description</Label>
              <Textarea
                id="product-description"
                value={productForm.description}
                onChange={(e) => setProductForm({ ...productForm, description: e.target.value })}
                placeholder="Describe the product..."
                data-testid="input-product-description"
              />
            </div>
            <div>
              <Label htmlFor="product-image">Image URL</Label>
              <Input
                id="product-image"
                value={productForm.imageUrl}
                onChange={(e) => setProductForm({ ...productForm, imageUrl: e.target.value })}
                placeholder="https://example.com/image.jpg"
                data-testid="input-product-image"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="product-price">Price ($)</Label>
                <Input
                  id="product-price"
                  type="number"
                  step="0.01"
                  value={productForm.priceDollars}
                  onChange={(e) => setProductForm({ ...productForm, priceDollars: e.target.value })}
                  placeholder="19.99"
                  data-testid="input-product-price"
                />
              </div>
              <div>
                <Label htmlFor="product-credit">Credit Amount ($)</Label>
                <Input
                  id="product-credit"
                  type="number"
                  step="0.01"
                  value={productForm.creditAmountDollars}
                  onChange={(e) => setProductForm({ ...productForm, creditAmountDollars: e.target.value })}
                  placeholder="5.00"
                  data-testid="input-product-credit"
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={productForm.isActive}
                onCheckedChange={(checked) => setProductForm({ ...productForm, isActive: checked })}
                data-testid="switch-product-active"
              />
              <Label>Active</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateProductOpen(false)}>Cancel</Button>
            <Button 
              onClick={() => selectedCampaign && createProductMutation.mutate({ campaignId: selectedCampaign.id, product: productForm })} 
              disabled={createProductMutation.isPending || !productForm.name || !productForm.priceDollars || !productForm.creditAmountDollars}
              data-testid="button-submit-product"
            >
              {createProductMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Add Product
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isEditProductOpen} onOpenChange={setIsEditProductOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Product</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="edit-product-name">Product Name</Label>
              <Input
                id="edit-product-name"
                value={productForm.name}
                onChange={(e) => setProductForm({ ...productForm, name: e.target.value })}
                data-testid="input-edit-product-name"
              />
            </div>
            <div>
              <Label htmlFor="edit-product-description">Description</Label>
              <Textarea
                id="edit-product-description"
                value={productForm.description}
                onChange={(e) => setProductForm({ ...productForm, description: e.target.value })}
                data-testid="input-edit-product-description"
              />
            </div>
            <div>
              <Label htmlFor="edit-product-image">Image URL</Label>
              <Input
                id="edit-product-image"
                value={productForm.imageUrl}
                onChange={(e) => setProductForm({ ...productForm, imageUrl: e.target.value })}
                data-testid="input-edit-product-image"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="edit-product-price">Price ($)</Label>
                <Input
                  id="edit-product-price"
                  type="number"
                  step="0.01"
                  value={productForm.priceDollars}
                  onChange={(e) => setProductForm({ ...productForm, priceDollars: e.target.value })}
                  data-testid="input-edit-product-price"
                />
              </div>
              <div>
                <Label htmlFor="edit-product-credit">Credit Amount ($)</Label>
                <Input
                  id="edit-product-credit"
                  type="number"
                  step="0.01"
                  value={productForm.creditAmountDollars}
                  onChange={(e) => setProductForm({ ...productForm, creditAmountDollars: e.target.value })}
                  data-testid="input-edit-product-credit"
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={productForm.isActive}
                onCheckedChange={(checked) => setProductForm({ ...productForm, isActive: checked })}
                data-testid="switch-edit-product-active"
              />
              <Label>Active</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditProductOpen(false)}>Cancel</Button>
            <Button 
              onClick={() => selectedProduct && updateProductMutation.mutate({ id: selectedProduct.id, data: productForm })} 
              disabled={updateProductMutation.isPending}
              data-testid="button-save-product"
            >
              {updateProductMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SchoolAdminLayout>
  );
}
