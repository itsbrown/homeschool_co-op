import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Copy, ExternalLink, QrCode, BarChart3, Plus, Trash2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { AppShell } from "@/components/AppShell";

interface MarketingLink {
  id: number;
  campaignId: string;
  name: string;
  description: string | null;
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
  utmContent: string | null;
  utmTerm: string | null;
  qrCodeUrl: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  trackingUrl?: string;
  shortUrl?: string;
}

interface LinkAnalytics {
  totalClicks: number;
  totalConversions: number;
  conversionRate: number;
  analytics: Array<{
    id: number;
    event: string;
    timestamp: string;
    ipAddress: string | null;
    userAgent: string | null;
    referrer: string | null;
  }>;
}

export default function MarketingLinksPage() {
  const [selectedLink, setSelectedLink] = useState<MarketingLink | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Form state
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    utmSource: "",
    utmMedium: "",
    utmCampaign: "",
    utmContent: "",
    utmTerm: ""
  });

  // Fetch marketing links
  const { data: links = [], isLoading } = useQuery<MarketingLink[]>({
    queryKey: ["/api/school-admin/marketing-links"],
    queryFn: () => apiRequest("/api/school-admin/marketing-links")
  });

  // Fetch analytics for selected link
  const { data: analytics } = useQuery<LinkAnalytics>({
    queryKey: ["/api/school-admin/marketing-links", selectedLink?.id, "analytics"],
    queryFn: () => apiRequest(`/api/school-admin/marketing-links/${selectedLink?.id}/analytics`),
    enabled: !!selectedLink
  });

  // Create marketing link mutation
  const createMutation = useMutation({
    mutationFn: (data: typeof formData) => 
      apiRequest("/api/school-admin/marketing-links", {
        method: "POST",
        body: JSON.stringify(data)
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/school-admin/marketing-links"] });
      setShowCreateForm(false);
      setFormData({
        name: "",
        description: "",
        utmSource: "",
        utmMedium: "",
        utmCampaign: "",
        utmContent: "",
        utmTerm: ""
      });
      toast({
        title: "Marketing link created",
        description: "Your marketing link has been created successfully with QR code."
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create marketing link. Please try again.",
        variant: "destructive"
      });
    }
  });

  // Delete marketing link mutation
  const deleteMutation = useMutation({
    mutationFn: (id: number) => 
      apiRequest(`/api/school-admin/marketing-links/${id}`, {
        method: "DELETE"
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/school-admin/marketing-links"] });
      toast({
        title: "Marketing link deleted",
        description: "The marketing link has been deleted successfully."
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete marketing link. Please try again.",
        variant: "destructive"
      });
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate(formData);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copied",
      description: "Link copied to clipboard"
    });
  };

  const utmSources = ["website", "social", "email", "flyer", "word-of-mouth", "referral"];
  const utmMediums = ["organic", "social", "email", "print", "referral", "direct"];

  return (
    <AppShell>
      <div className="container mx-auto py-6 space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Marketing Links</h1>
            <p className="text-muted-foreground">
              Generate trackable links with QR codes for enrollment campaigns
            </p>
          </div>
          <Button onClick={() => setShowCreateForm(true)} className="flex items-center gap-2">
            <Plus className="w-4 h-4" />
            Create Link
          </Button>
        </div>

        <Tabs defaultValue="links" className="space-y-4">
          <TabsList>
            <TabsTrigger value="links">Marketing Links</TabsTrigger>
            {selectedLink && (
              <TabsTrigger value="analytics">Analytics</TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="links" className="space-y-4">
            {/* Create Form */}
            {showCreateForm && (
              <Card>
                <CardHeader>
                  <CardTitle>Create Marketing Link</CardTitle>
                  <CardDescription>
                    Generate a trackable link with UTM parameters and QR code
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="name">Campaign Name</Label>
                        <Input
                          id="name"
                          value={formData.name}
                          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                          placeholder="e.g., Summer Camp 2025"
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="description">Description</Label>
                        <Input
                          id="description"
                          value={formData.description}
                          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                          placeholder="Optional campaign description"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="utmSource">UTM Source</Label>
                        <Select value={formData.utmSource} onValueChange={(value) => setFormData({ ...formData, utmSource: value })}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select source" />
                          </SelectTrigger>
                          <SelectContent>
                            {utmSources.map((source) => (
                              <SelectItem key={source} value={source}>
                                {source}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="utmMedium">UTM Medium</Label>
                        <Select value={formData.utmMedium} onValueChange={(value) => setFormData({ ...formData, utmMedium: value })}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select medium" />
                          </SelectTrigger>
                          <SelectContent>
                            {utmMediums.map((medium) => (
                              <SelectItem key={medium} value={medium}>
                                {medium}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="utmCampaign">UTM Campaign</Label>
                        <Input
                          id="utmCampaign"
                          value={formData.utmCampaign}
                          onChange={(e) => setFormData({ ...formData, utmCampaign: e.target.value })}
                          placeholder="e.g., summer-enrollment"
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="utmContent">UTM Content</Label>
                        <Input
                          id="utmContent"
                          value={formData.utmContent}
                          onChange={(e) => setFormData({ ...formData, utmContent: e.target.value })}
                          placeholder="Optional content identifier"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="utmTerm">UTM Term</Label>
                        <Input
                          id="utmTerm"
                          value={formData.utmTerm}
                          onChange={(e) => setFormData({ ...formData, utmTerm: e.target.value })}
                          placeholder="Optional keyword term"
                        />
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <Button type="submit" disabled={createMutation.isPending}>
                        {createMutation.isPending ? "Creating..." : "Create Link"}
                      </Button>
                      <Button type="button" variant="outline" onClick={() => setShowCreateForm(false)}>
                        Cancel
                      </Button>
                    </div>
                  </form>
                </CardContent>
              </Card>
            )}

            {/* Links List */}
            <div className="grid gap-4">
              {isLoading ? (
                <Card>
                  <CardContent className="py-8">
                    <div className="text-center text-muted-foreground">Loading marketing links...</div>
                  </CardContent>
                </Card>
              ) : links.length === 0 ? (
                <Card>
                  <CardContent className="py-8">
                    <div className="text-center space-y-2">
                      <p className="text-muted-foreground">No marketing links created yet</p>
                      <Button onClick={() => setShowCreateForm(true)}>Create your first link</Button>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                links.map((link) => (
                  <Card key={link.id} className="hover:shadow-md transition-shadow">
                    <CardHeader>
                      <div className="flex justify-between items-start">
                        <div>
                          <CardTitle className="flex items-center gap-2">
                            {link.name}
                            <Badge variant={link.isActive ? "default" : "secondary"}>
                              {link.isActive ? "Active" : "Inactive"}
                            </Badge>
                          </CardTitle>
                          {link.description && (
                            <CardDescription>{link.description}</CardDescription>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setSelectedLink(link)}
                            className="flex items-center gap-1"
                          >
                            <BarChart3 className="w-4 h-4" />
                            Analytics
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => deleteMutation.mutate(link.id)}
                            disabled={deleteMutation.isPending}
                            className="flex items-center gap-1 text-destructive hover:text-destructive"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-3 gap-4 text-sm">
                        <div>
                          <span className="font-medium">Source:</span> {link.utmSource}
                        </div>
                        <div>
                          <span className="font-medium">Medium:</span> {link.utmMedium}
                        </div>
                        <div>
                          <span className="font-medium">Campaign:</span> {link.utmCampaign}
                        </div>
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <Label className="text-sm font-medium">Tracking URL:</Label>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => copyToClipboard(link.trackingUrl || '')}
                            className="h-6 px-2"
                          >
                            <Copy className="w-3 h-3" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => window.open(link.trackingUrl, '_blank')}
                            className="h-6 px-2"
                          >
                            <ExternalLink className="w-3 h-3" />
                          </Button>
                        </div>
                        <div className="bg-muted p-2 rounded text-sm font-mono break-all">
                          {link.trackingUrl}
                        </div>
                      </div>

                      {link.qrCodeUrl && (
                        <div className="flex items-center gap-4">
                          <div>
                            <Label className="text-sm font-medium">QR Code:</Label>
                            <div className="mt-1">
                              <img 
                                src={link.qrCodeUrl} 
                                alt="QR Code" 
                                className="w-16 h-16 border rounded"
                              />
                            </div>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => window.open(link.qrCodeUrl!, '_blank')}
                            className="flex items-center gap-1"
                          >
                            <QrCode className="w-4 h-4" />
                            Download QR
                          </Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </TabsContent>

          {selectedLink && (
            <TabsContent value="analytics" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Analytics for "{selectedLink.name}"</CardTitle>
                  <CardDescription>
                    Track clicks, conversions, and campaign performance
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {analytics && (
                    <div className="space-y-6">
                      <div className="grid grid-cols-3 gap-4">
                        <Card>
                          <CardContent className="pt-6">
                            <div className="text-center">
                              <div className="text-2xl font-bold">{analytics.totalClicks}</div>
                              <div className="text-sm text-muted-foreground">Total Clicks</div>
                            </div>
                          </CardContent>
                        </Card>
                        <Card>
                          <CardContent className="pt-6">
                            <div className="text-center">
                              <div className="text-2xl font-bold">{analytics.totalConversions}</div>
                              <div className="text-sm text-muted-foreground">Conversions</div>
                            </div>
                          </CardContent>
                        </Card>
                        <Card>
                          <CardContent className="pt-6">
                            <div className="text-center">
                              <div className="text-2xl font-bold">{analytics.conversionRate}%</div>
                              <div className="text-sm text-muted-foreground">Conversion Rate</div>
                            </div>
                          </CardContent>
                        </Card>
                      </div>

                      {analytics.analytics.length > 0 && (
                        <div>
                          <h4 className="font-medium mb-3">Recent Activity</h4>
                          <div className="space-y-2 max-h-64 overflow-y-auto">
                            {analytics.analytics.slice(0, 10).map((event) => (
                              <div key={event.id} className="flex justify-between items-center p-2 bg-muted rounded">
                                <div className="flex items-center gap-2">
                                  <Badge variant={event.event === 'click' ? 'default' : 'secondary'}>
                                    {event.event}
                                  </Badge>
                                  <span className="text-sm">
                                    {new Date(event.timestamp).toLocaleString()}
                                  </span>
                                </div>
                                {event.referrer && (
                                  <span className="text-xs text-muted-foreground">
                                    from {new URL(event.referrer).hostname}
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          )}
        </Tabs>
      </div>
    </SchoolAdminAppShell>
  );
}