import { useState, useEffect } from "react";
import { useAuth } from "@/components/SupabaseProvider";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Bell, 
  User, 
  Shield, 
  Save, 
  School, 
  Settings, 
  Mail,
  Phone,
  Lock,
  Eye,
  EyeOff,
  AlertCircle,
  CheckCircle,
  Upload,
  Image as ImageIcon,
  X
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import SchoolAdminLayout from "@/components/layout/SchoolAdminLayout";

interface UserProfile {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  phoneNumber: string;
  role: string;
  school?: {
    id: number;
    name: string;
    logo?: string | null;
  };
}

interface SchoolData {
  id: number;
  name: string;
  type: string;
  city: string;
  state: string;
  registrationCode?: string;
  logo?: string;
  status?: string;
  membershipFeeAmount?: number;
  membershipRenewalMonth?: number;
  membershipRenewalDay?: number;
  membershipGracePeriodDays?: number;
  membershipRequired?: boolean;
  showSubscriptionStatus?: boolean;
}

interface NotificationSettings {
  emailNotifications: boolean;
  smsNotifications: boolean;
  enrollmentAlerts: boolean;
  paymentReminders: boolean;
  staffUpdates: boolean;
  systemMaintenance: boolean;
}

export default function SchoolSettingsPage() {
  const { user, session, signOut } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Profile form state
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [username, setUsername] = useState("");

  // Password change state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Notification preferences state
  const [notifications, setNotifications] = useState<NotificationSettings>({
    emailNotifications: true,
    smsNotifications: false,
    enrollmentAlerts: true,
    paymentReminders: true,
    staffUpdates: true,
    systemMaintenance: false,
  });

  // Fetch user profile data
  const { data: userProfile } = useQuery<UserProfile>({
    queryKey: ['/api/users/profile'],
    enabled: !!user?.email
  });

  // Fetch school data
  const { data: schoolData, isLoading: isSchoolLoading } = useQuery<SchoolData>({
    queryKey: ['/api/school-admin/my-school'],
    enabled: !!user?.email,
  });

  // Initialize form with user data
  useEffect(() => {
    if (userProfile) {
      setFirstName(userProfile.firstName || "");
      setLastName(userProfile.lastName || "");
      setPhoneNumber(userProfile.phoneNumber || "");
      setUsername(userProfile.email || "");
    }
  }, [userProfile]);

  // Update profile mutation
  const updateProfileMutation = useMutation({
    mutationFn: async (profileData: {
      firstName: string;
      lastName: string;
      phoneNumber: string;
      username: string;
    }) => {
      return await apiRequest('PATCH', '/api/users/profile', profileData);
    },
    onSuccess: () => {
      toast({
        title: "Profile updated",
        description: "Your profile information has been saved successfully.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to update profile. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Update notifications mutation
  const updateNotificationsMutation = useMutation({
    mutationFn: async (notificationSettings: NotificationSettings) => {
      return await apiRequest('PATCH', '/api/users/notifications', notificationSettings);
    },
    onSuccess: () => {
      toast({
        title: "Notifications updated",
        description: "Your notification preferences have been saved.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to update notification settings.",
        variant: "destructive",
      });
    },
  });

  // Change password mutation
  const changePasswordMutation = useMutation({
    mutationFn: async (passwordData: {
      currentPassword: string;
      newPassword: string;
    }) => {
      return await apiRequest('POST', '/api/users/change-password', passwordData);
    },
    onSuccess: () => {
      toast({
        title: "Password changed",
        description: "Your password has been updated successfully.",
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to change password. Please check your current password.",
        variant: "destructive",
      });
    },
  });

  const handleSaveProfile = () => {
    updateProfileMutation.mutate({
      firstName,
      lastName,
      phoneNumber,
      username,
    });
  };

  const handleSaveNotifications = () => {
    updateNotificationsMutation.mutate(notifications);
  };

  const handleChangePassword = () => {
    if (newPassword !== confirmPassword) {
      toast({
        title: "Error",
        description: "New passwords do not match.",
        variant: "destructive",
      });
      return;
    }

    if (newPassword.length < 8) {
      toast({
        title: "Error",
        description: "Password must be at least 8 characters long.",
        variant: "destructive",
      });
      return;
    }

    changePasswordMutation.mutate({
      currentPassword,
      newPassword,
    });
  };

  const updateNotificationSetting = (key: keyof NotificationSettings, value: boolean) => {
    setNotifications(prev => ({
      ...prev,
      [key]: value
    }));
  };

  // Logo upload state
  const [selectedLogo, setSelectedLogo] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);

  // Membership configuration state
  const [membershipDialogOpen, setMembershipDialogOpen] = useState(false);
  const [membershipFormData, setMembershipFormData] = useState({
    feeAmount: '',
    renewalMonth: '',
    renewalDay: '',
    gracePeriod: '',
    required: true
  });

  // Stripe sync state
  const [stripeSyncEmail, setStripeSyncEmail] = useState('');
  const [stripeSyncResult, setStripeSyncResult] = useState<{ success: boolean; message: string } | null>(null);

  // Logo upload mutation
  const uploadLogoMutation = useMutation({
    mutationFn: async (file: File) => {
      const schoolId = userProfile?.school?.id;
      if (!schoolId) {
        throw new Error("School ID not found");
      }

      const formData = new FormData();
      formData.append('logo', file);
      formData.append('schoolId', String(schoolId));

      const token = session?.access_token;
      if (!token) {
        throw new Error("Not authenticated");
      }

      const response = await fetch('/api/schools/upload-logo', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        body: formData
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to upload logo');
      }

      return response.json();
    },
    onSuccess: () => {
      // Invalidate all queries that might display the school logo
      // Use predicate to catch all variations of school-related queries (including those with email in path)
      queryClient.invalidateQueries({ 
        predicate: (query) => {
          const key = query.queryKey[0];
          if (typeof key === 'string') {
            return key.includes('/api/school-admin/my-school') || 
                   key.includes('/api/school-parents/school') ||
                   key.includes('/api/users/profile');
          }
          return false;
        }
      });
      // Also invalidate by exact keys for standard format queries
      queryClient.invalidateQueries({ queryKey: ['/api/users/profile'] });
      queryClient.invalidateQueries({ queryKey: ['/api/school-admin/my-school'] });
      queryClient.invalidateQueries({ queryKey: ['/api/school-parents/school'] });
      // Force refetch to get fresh data
      queryClient.refetchQueries({ queryKey: ['/api/users/profile'] });
      queryClient.refetchQueries({ queryKey: ['/api/school-admin/my-school'] });
      setSelectedLogo(null);
      setLogoPreview(null);
      toast({
        title: "Logo uploaded",
        description: "Your school logo has been updated successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Upload failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file type
      if (!file.type.startsWith('image/')) {
        toast({
          title: "Invalid file type",
          description: "Please select an image file (PNG, JPEG, SVG)",
          variant: "destructive",
        });
        return;
      }

      // Validate file size (5MB limit)
      if (file.size > 5 * 1024 * 1024) {
        toast({
          title: "File too large",
          description: "Maximum file size is 5MB",
          variant: "destructive",
        });
        return;
      }

      setSelectedLogo(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setLogoPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleUploadLogo = () => {
    if (selectedLogo) {
      uploadLogoMutation.mutate(selectedLogo);
    }
  };

  const handleCancelLogo = () => {
    setSelectedLogo(null);
    setLogoPreview(null);
  };

  // Membership update mutation
  const membershipUpdateMutation = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest('PATCH', '/api/school-admin/my-school/membership', data);
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Membership configuration updated successfully",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/school-admin/my-school'] });
      setMembershipDialogOpen(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update membership configuration",
        variant: "destructive",
      });
    },
  });

  // Stripe sync mutation
  const stripeSyncMutation = useMutation({
    mutationFn: async (email: string) => {
      return await apiRequest('POST', '/api/admin/sync-stripe-subscription', { email });
    },
    onSuccess: (data) => {
      setStripeSyncResult({
        success: true,
        message: data.message || 'Successfully synced Stripe subscription'
      });
      toast({
        title: "Stripe Sync Successful",
        description: data.message || 'User subscription synced successfully',
      });
      // Clear the email input
      setStripeSyncEmail('');
    },
    onError: (error: Error) => {
      setStripeSyncResult({
        success: false,
        message: error.message || 'Failed to sync Stripe subscription'
      });
      toast({
        title: "Stripe Sync Failed",
        description: error.message || 'Failed to sync Stripe subscription',
        variant: "destructive",
      });
    },
  });

  const handleStripeSyncSubmit = () => {
    if (!stripeSyncEmail.trim()) {
      toast({
        title: "Email Required",
        description: "Please enter a user email address",
        variant: "destructive",
      });
      return;
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(stripeSyncEmail)) {
      toast({
        title: "Invalid Email",
        description: "Please enter a valid email address",
        variant: "destructive",
      });
      return;
    }

    setStripeSyncResult(null); // Clear previous results
    stripeSyncMutation.mutate(stripeSyncEmail);
  };

  // Open membership dialog with current values
  const handleOpenMembershipDialog = () => {
    setMembershipFormData({
      feeAmount: schoolData?.membershipFeeAmount ? ((schoolData.membershipFeeAmount) / 100).toString() : '0',
      renewalMonth: schoolData?.membershipRenewalMonth?.toString() || '9',
      renewalDay: schoolData?.membershipRenewalDay?.toString() || '1',
      gracePeriod: schoolData?.membershipGracePeriodDays?.toString() || '30',
      required: schoolData?.membershipRequired ?? true
    });
    setMembershipDialogOpen(true);
  };

  // Handle membership form submission
  const handleMembershipSubmit = () => {
    // Validate fee amount (default empty to "0")
    const feeAmount = parseFloat(membershipFormData.feeAmount || "0");
    if (isNaN(feeAmount) || feeAmount < 0) {
      toast({
        title: "Invalid fee amount",
        description: "Please enter a valid fee amount (0 or greater)",
        variant: "destructive",
      });
      return;
    }

    // Validate renewal month
    const renewalMonth = parseInt(membershipFormData.renewalMonth);
    if (isNaN(renewalMonth) || renewalMonth < 1 || renewalMonth > 12) {
      toast({
        title: "Invalid renewal month",
        description: "Please select a valid month",
        variant: "destructive",
      });
      return;
    }

    // Validate renewal day
    const renewalDay = parseInt(membershipFormData.renewalDay);
    if (isNaN(renewalDay) || renewalDay < 1 || renewalDay > 31) {
      toast({
        title: "Invalid renewal day",
        description: "Please enter a valid day (1-31)",
        variant: "destructive",
      });
      return;
    }

    // Validate grace period
    const gracePeriod = parseInt(membershipFormData.gracePeriod);
    if (isNaN(gracePeriod) || gracePeriod < 0) {
      toast({
        title: "Invalid grace period",
        description: "Please enter a valid grace period (0 or greater)",
        variant: "destructive",
      });
      return;
    }

    membershipUpdateMutation.mutate({
      membershipFeeAmount: Math.round(feeAmount * 100),
      membershipRenewalMonth: renewalMonth,
      membershipRenewalDay: renewalDay,
      membershipGracePeriodDays: gracePeriod,
      membershipRequired: membershipFormData.required
    });
  };

  return (
    <SchoolAdminLayout pageTitle="Account Settings">
      <div className="container mx-auto py-6">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Account Settings</h1>
          <p className="text-muted-foreground">
            Manage your account information, security settings, and preferences
          </p>
        </div>

        <div className="max-w-4xl mx-auto">
          <Tabs defaultValue="profile" className="space-y-6">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="profile" className="flex items-center gap-2">
                <User className="h-4 w-4" />
                Profile
              </TabsTrigger>
              <TabsTrigger value="security" className="flex items-center gap-2">
                <Shield className="h-4 w-4" />
                Security
              </TabsTrigger>
              <TabsTrigger value="notifications" className="flex items-center gap-2">
                <Bell className="h-4 w-4" />
                Notifications
              </TabsTrigger>
              <TabsTrigger value="school" className="flex items-center gap-2">
                <School className="h-4 w-4" />
                School
              </TabsTrigger>
            </TabsList>

            {/* Profile Tab */}
            <TabsContent value="profile" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <User className="h-5 w-5" />
                    Profile Information
                  </CardTitle>
                  <CardDescription>
                    Update your personal information and account details
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="flex items-center gap-4">
                    <Avatar className="h-20 w-20">
                      <AvatarImage src={user?.user_metadata?.picture} alt={user?.email || ""} />
                      <AvatarFallback className="text-lg">
                        {user?.email?.charAt(0)?.toUpperCase() || "U"}
                      </AvatarFallback>
                    </Avatar>
                    <div className="space-y-1">
                      <h3 className="font-semibold text-lg">{user?.email}</h3>
                      <p className="text-muted-foreground">{user?.email}</p>
                      <Badge variant="secondary">
                        {user?.role === 'schoolAdmin' ? 'School Administrator' : 'Staff Member'}
                      </Badge>
                    </div>
                  </div>

                  <Separator />

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="firstName">First Name</Label>
                      <Input
                        id="firstName"
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        placeholder="Enter your first name"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="lastName">Last Name</Label>
                      <Input
                        id="lastName"
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        placeholder="Enter your last name"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="username">Username</Label>
                      <Input
                        id="username"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder="Enter your username"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="email">Email Address</Label>
                      <Input
                        id="email"
                        type="email"
                        defaultValue={user?.email || ""}
                        placeholder="Enter your email"
                        disabled
                      />
                      <p className="text-sm text-muted-foreground">
                        Email changes require administrator approval
                      </p>
                    </div>

                    <div className="space-y-2 md:col-span-2">
                      <Label htmlFor="phone">Phone Number</Label>
                      <Input
                        id="phone"
                        type="tel"
                        value={phoneNumber}
                        onChange={(e) => setPhoneNumber(e.target.value)}
                        placeholder="Enter your phone number"
                      />
                    </div>
                  </div>

                  <div className="flex gap-4">
                    <Button 
                      onClick={handleSaveProfile} 
                      disabled={updateProfileMutation.isPending}
                      className="flex items-center gap-2"
                    >
                      <Save className="h-4 w-4" />
                      {updateProfileMutation.isPending ? "Saving..." : "Save Changes"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Security Tab */}
            <TabsContent value="security" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Lock className="h-5 w-5" />
                    Change Password
                  </CardTitle>
                  <CardDescription>
                    Update your account password for enhanced security
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="currentPassword">Current Password</Label>
                    <div className="relative">
                      <Input
                        id="currentPassword"
                        type={showCurrentPassword ? "text" : "password"}
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        placeholder="Enter your current password"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                        onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                      >
                        {showCurrentPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="newPassword">New Password</Label>
                    <div className="relative">
                      <Input
                        id="newPassword"
                        type={showNewPassword ? "text" : "password"}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="Enter your new password"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                        onClick={() => setShowNewPassword(!showNewPassword)}
                      >
                        {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="confirmPassword">Confirm New Password</Label>
                    <div className="relative">
                      <Input
                        id="confirmPassword"
                        type={showConfirmPassword ? "text" : "password"}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Confirm your new password"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      >
                        {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>

                  {newPassword && (
                    <Alert>
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>
                        Password must be at least 8 characters long and include uppercase, lowercase, numbers, and special characters.
                      </AlertDescription>
                    </Alert>
                  )}

                  <Button 
                    onClick={handleChangePassword}
                    disabled={changePasswordMutation.isPending || !currentPassword || !newPassword || !confirmPassword}
                    className="flex items-center gap-2"
                  >
                    <Lock className="h-4 w-4" />
                    {changePasswordMutation.isPending ? "Changing..." : "Change Password"}
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Shield className="h-5 w-5" />
                    Account Security
                  </CardTitle>
                  <CardDescription>
                    Additional security options for your account
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Two-Factor Authentication</Label>
                    <p className="text-sm text-muted-foreground">
                      Add an extra layer of security to your account
                    </p>
                    <Button variant="outline" size="sm">
                      Enable 2FA
                    </Button>
                  </div>

                  <Separator />

                  <div className="space-y-2">
                    <Label>Account Deactivation</Label>
                    <p className="text-sm text-muted-foreground">
                      Temporarily deactivate your account access
                    </p>
                    <Button variant="destructive" size="sm">
                      Deactivate Account
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Notifications Tab */}
            <TabsContent value="notifications" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Bell className="h-5 w-5" />
                    Notification Preferences
                  </CardTitle>
                  <CardDescription>
                    Choose how you'd like to be notified about important updates
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label htmlFor="email-notifications">Email Notifications</Label>
                        <p className="text-sm text-muted-foreground">
                          Receive updates and announcements via email
                        </p>
                      </div>
                      <Switch
                        id="email-notifications"
                        checked={notifications.emailNotifications}
                        onCheckedChange={(value) => updateNotificationSetting('emailNotifications', value)}
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label htmlFor="sms-notifications">SMS Notifications</Label>
                        <p className="text-sm text-muted-foreground">
                          Receive urgent alerts via text message
                        </p>
                      </div>
                      <Switch
                        id="sms-notifications"
                        checked={notifications.smsNotifications}
                        onCheckedChange={(value) => updateNotificationSetting('smsNotifications', value)}
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label htmlFor="enrollment-alerts">Enrollment Alerts</Label>
                        <p className="text-sm text-muted-foreground">
                          Get notified about new enrollments and changes
                        </p>
                      </div>
                      <Switch
                        id="enrollment-alerts"
                        checked={notifications.enrollmentAlerts}
                        onCheckedChange={(value) => updateNotificationSetting('enrollmentAlerts', value)}
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label htmlFor="payment-reminders">Payment Reminders</Label>
                        <p className="text-sm text-muted-foreground">
                          Receive reminders for upcoming payments
                        </p>
                      </div>
                      <Switch
                        id="payment-reminders"
                        checked={notifications.paymentReminders}
                        onCheckedChange={(value) => updateNotificationSetting('paymentReminders', value)}
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label htmlFor="staff-updates">Staff Updates</Label>
                        <p className="text-sm text-muted-foreground">
                          Get updates about staff changes and announcements
                        </p>
                      </div>
                      <Switch
                        id="staff-updates"
                        checked={notifications.staffUpdates}
                        onCheckedChange={(value) => updateNotificationSetting('staffUpdates', value)}
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label htmlFor="system-maintenance">System Maintenance</Label>
                        <p className="text-sm text-muted-foreground">
                          Receive notifications about scheduled maintenance
                        </p>
                      </div>
                      <Switch
                        id="system-maintenance"
                        checked={notifications.systemMaintenance}
                        onCheckedChange={(value) => updateNotificationSetting('systemMaintenance', value)}
                      />
                    </div>
                  </div>

                  <Button 
                    onClick={handleSaveNotifications}
                    disabled={updateNotificationsMutation.isPending}
                    className="flex items-center gap-2"
                  >
                    <Save className="h-4 w-4" />
                    {updateNotificationsMutation.isPending ? "Saving..." : "Save Preferences"}
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>

            {/* School Tab */}
            <TabsContent value="school" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <School className="h-5 w-5" />
                    School Information
                  </CardTitle>
                  <CardDescription>
                    View and manage your school association settings
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-4 border rounded-lg">
                      <div>
                        <h3 className="font-semibold">{userProfile?.school?.name || 'No School'}</h3>
                        <p className="text-sm text-muted-foreground">
                          School ID: {userProfile?.school?.id || 'N/A'}
                        </p>
                      </div>
                      <Badge variant="outline">Active</Badge>
                    </div>

                    <Alert>
                      <CheckCircle className="h-4 w-4" />
                      <AlertDescription>
                        You are successfully associated with this school. Contact your administrator for any changes.
                      </AlertDescription>
                    </Alert>
                  </div>
                </CardContent>
              </Card>

              {/* School Logo Upload */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <ImageIcon className="h-5 w-5" />
                    School Logo
                  </CardTitle>
                  <CardDescription>
                    Upload or update your school's logo (PNG, JPEG, SVG - Max 5MB)
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex flex-col sm:flex-row gap-6">
                    {/* Current Logo Display */}
                    <div className="flex-shrink-0">
                      <Label className="text-sm font-medium mb-2 block">Current Logo</Label>
                      <Avatar className="h-24 w-24">
                        {userProfile?.school?.logo ? (
                          <AvatarImage src={userProfile.school.logo} alt={userProfile.school.name} />
                        ) : (
                          <AvatarFallback className="text-2xl">
                            {userProfile?.school?.name?.split(' ').map(word => word[0]).join('').toUpperCase() || 'SC'}
                          </AvatarFallback>
                        )}
                      </Avatar>
                    </div>

                    {/* Upload Section */}
                    <div className="flex-1 space-y-4">
                      {/* File Input */}
                      <div>
                        <Label htmlFor="logo-upload" className="text-sm font-medium">
                          Choose New Logo
                        </Label>
                        <Input
                          id="logo-upload"
                          type="file"
                          accept="image/png, image/jpeg, image/svg+xml"
                          onChange={handleLogoChange}
                          className="mt-2"
                          disabled={!userProfile?.school?.id || uploadLogoMutation.isPending}
                          data-testid="input-logo-upload"
                        />
                      </div>

                      {/* Preview and Actions */}
                      {(logoPreview || selectedLogo) && (
                        <div className="space-y-3">
                          <div className="border rounded-lg p-4 bg-muted/30">
                            <Label className="text-sm font-medium mb-2 block">Preview</Label>
                            <div className="flex items-center gap-4">
                              <Avatar className="h-16 w-16">
                                <AvatarImage src={logoPreview || ''} alt="Logo preview" />
                              </Avatar>
                              <div className="flex-1">
                                <p className="text-sm font-medium">{selectedLogo?.name}</p>
                                <p className="text-xs text-muted-foreground">
                                  {selectedLogo?.size ? `${(selectedLogo.size / 1024).toFixed(1)} KB` : ''}
                                </p>
                              </div>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={handleCancelLogo}
                                disabled={uploadLogoMutation.isPending}
                                data-testid="button-cancel-logo"
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>

                          <div className="flex gap-2">
                            <Button
                              onClick={handleUploadLogo}
                              disabled={!selectedLogo || uploadLogoMutation.isPending}
                              className="flex items-center gap-2"
                              data-testid="button-upload-logo"
                            >
                              {uploadLogoMutation.isPending ? (
                                <>
                                  <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                  Uploading...
                                </>
                              ) : (
                                <>
                                  <Upload className="h-4 w-4" />
                                  Upload Logo
                                </>
                              )}
                            </Button>
                            <Button
                              variant="outline"
                              onClick={handleCancelLogo}
                              disabled={uploadLogoMutation.isPending}
                            >
                              Cancel
                            </Button>
                          </div>
                        </div>
                      )}

                      {!userProfile?.school?.id && (
                        <Alert>
                          <AlertCircle className="h-4 w-4" />
                          <AlertDescription>
                            You must be associated with a school to upload a logo.
                          </AlertDescription>
                        </Alert>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Membership Configuration */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Settings className="h-5 w-5" />
                    Annual Membership Fees
                  </CardTitle>
                  <CardDescription>
                    Configure annual membership fees for parent families. When enabled, families are automatically enrolled in annual memberships when they register for classes.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label>Membership Fee Amount</Label>
                      <div className="mt-1 p-2 bg-gray-50 rounded border">
                        ${((schoolData?.membershipFeeAmount || 0) / 100).toFixed(2)}
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        Current annual membership fee (in USD)
                      </p>
                    </div>
                    <div>
                      <Label>Renewal Date</Label>
                      <div className="mt-1 p-2 bg-gray-50 rounded border">
                        {schoolData?.membershipRenewalMonth ? 
                          new Date(0, (schoolData.membershipRenewalMonth - 1), schoolData.membershipRenewalDay || 1).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })
                          : 'Not configured'
                        }
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        Annual membership renewal date
                      </p>
                    </div>
                  </div>
                  <div>
                    <Label>Grace Period</Label>
                    <div className="mt-1 p-2 bg-gray-50 rounded border">
                      {schoolData?.membershipGracePeriodDays || 30} days
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      Grace period after expiration before membership becomes inactive
                    </p>
                  </div>
                  
                  <div className="pt-4 border-t">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="font-medium">Membership Status</h4>
                        <p className="text-sm text-muted-foreground">
                          {schoolData?.membershipFeeAmount && schoolData?.membershipFeeAmount > 0 
                            ? `Membership fees are enabled at $${((schoolData.membershipFeeAmount) / 100).toFixed(2)} annually`
                            : 'Membership fees are not configured'
                          }
                        </p>
                      </div>
                      <Badge variant={schoolData?.membershipFeeAmount && schoolData?.membershipFeeAmount > 0 ? "default" : "secondary"}>
                        {schoolData?.membershipFeeAmount && schoolData?.membershipFeeAmount > 0 ? "Enabled" : "Disabled"}
                      </Badge>
                    </div>
                    
                    <div className="mt-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
                      <h5 className="font-medium text-blue-900 mb-2">How Membership Fees Work</h5>
                      <ul className="text-sm text-blue-800 space-y-1">
                        <li>• Parents are automatically assigned annual membership when they enroll children in classes</li>
                        <li>• Membership fees are separate from class fees and tracked independently</li>
                        <li>• School administrators can mark membership payments as paid manually</li>
                        <li>• Expired memberships enter a grace period before becoming inactive</li>
                      </ul>
                    </div>

                    <div className="mt-4">
                      <Dialog open={membershipDialogOpen} onOpenChange={setMembershipDialogOpen}>
                        <DialogTrigger asChild>
                          <Button 
                            variant="outline" 
                            className="w-full"
                            onClick={handleOpenMembershipDialog}
                            data-testid="button-configure-membership"
                          >
                            <Settings className="h-4 w-4 mr-2" />
                            Configure Membership Settings
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-[500px]">
                          <DialogHeader>
                            <DialogTitle>Membership Configuration</DialogTitle>
                            <DialogDescription>
                              Configure annual membership fees and renewal settings for parent families
                            </DialogDescription>
                          </DialogHeader>
                          
                          <div className="space-y-4 py-4">
                            {/* Fee Amount */}
                            <div className="space-y-2">
                              <Label htmlFor="feeAmount">Annual Membership Fee (USD)</Label>
                              <Input
                                id="feeAmount"
                                type="number"
                                step="0.01"
                                min="0"
                                placeholder="50.00"
                                value={membershipFormData.feeAmount}
                                onChange={(e) => setMembershipFormData({ ...membershipFormData, feeAmount: e.target.value })}
                                data-testid="input-membership-fee"
                              />
                              <p className="text-sm text-muted-foreground">
                                Set to $0 to disable membership fees
                              </p>
                            </div>

                            {/* Renewal Month */}
                            <div className="space-y-2">
                              <Label htmlFor="renewalMonth">Renewal Month</Label>
                              <Select
                                value={membershipFormData.renewalMonth}
                                onValueChange={(value) => setMembershipFormData({ ...membershipFormData, renewalMonth: value })}
                              >
                                <SelectTrigger id="renewalMonth" data-testid="select-renewal-month">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="1">January</SelectItem>
                                  <SelectItem value="2">February</SelectItem>
                                  <SelectItem value="3">March</SelectItem>
                                  <SelectItem value="4">April</SelectItem>
                                  <SelectItem value="5">May</SelectItem>
                                  <SelectItem value="6">June</SelectItem>
                                  <SelectItem value="7">July</SelectItem>
                                  <SelectItem value="8">August</SelectItem>
                                  <SelectItem value="9">September</SelectItem>
                                  <SelectItem value="10">October</SelectItem>
                                  <SelectItem value="11">November</SelectItem>
                                  <SelectItem value="12">December</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>

                            {/* Renewal Day */}
                            <div className="space-y-2">
                              <Label htmlFor="renewalDay">Renewal Day</Label>
                              <Input
                                id="renewalDay"
                                type="number"
                                min="1"
                                max="31"
                                value={membershipFormData.renewalDay}
                                onChange={(e) => setMembershipFormData({ ...membershipFormData, renewalDay: e.target.value })}
                                data-testid="input-renewal-day"
                              />
                            </div>

                            {/* Grace Period */}
                            <div className="space-y-2">
                              <Label htmlFor="gracePeriod">Grace Period (Days)</Label>
                              <Input
                                id="gracePeriod"
                                type="number"
                                min="0"
                                value={membershipFormData.gracePeriod}
                                onChange={(e) => setMembershipFormData({ ...membershipFormData, gracePeriod: e.target.value })}
                                data-testid="input-grace-period"
                              />
                              <p className="text-sm text-muted-foreground">
                                Number of days after expiration before membership becomes inactive
                              </p>
                            </div>

                            {/* Membership Required */}
                            <div className="flex items-center justify-between space-x-2">
                              <div className="space-y-0.5">
                                <Label htmlFor="membershipRequired">Membership Required</Label>
                                <p className="text-sm text-muted-foreground">
                                  Require families to have active membership to enroll in classes
                                </p>
                              </div>
                              <Switch
                                id="membershipRequired"
                                checked={membershipFormData.required}
                                onCheckedChange={(checked) => setMembershipFormData({ ...membershipFormData, required: checked })}
                                data-testid="switch-membership-required"
                              />
                            </div>
                          </div>

                          <DialogFooter>
                            <Button 
                              variant="outline" 
                              onClick={() => setMembershipDialogOpen(false)}
                              disabled={membershipUpdateMutation.isPending}
                              data-testid="button-cancel-membership"
                            >
                              Cancel
                            </Button>
                            <Button 
                              onClick={handleMembershipSubmit}
                              disabled={membershipUpdateMutation.isPending}
                              data-testid="button-save-membership"
                            >
                              {membershipUpdateMutation.isPending ? (
                                <>
                                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                                  Saving...
                                </>
                              ) : (
                                <>
                                  <Save className="h-4 w-4 mr-2" />
                                  Save Changes
                                </>
                              )}
                            </Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                    </div>
                  </div>

                  {/* Stripe Manual Sync Section */}
                  <Separator className="my-6" />
                  <div className="space-y-4">
                    <div>
                      <h4 className="font-medium mb-1">Manual Stripe Subscription Sync</h4>
                      <p className="text-sm text-muted-foreground">
                        Look up and sync a user's Stripe subscription by email address. This will update their membership status and customer ID if an active subscription is found.
                      </p>
                    </div>

                    <div className="flex gap-3">
                      <div className="flex-1">
                        <Input
                          type="email"
                          placeholder="user@example.com"
                          value={stripeSyncEmail}
                          onChange={(e) => setStripeSyncEmail(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              handleStripeSyncSubmit();
                            }
                          }}
                          disabled={stripeSyncMutation.isPending}
                          data-testid="input-stripe-sync-email"
                        />
                      </div>
                      <Button 
                        onClick={handleStripeSyncSubmit}
                        disabled={stripeSyncMutation.isPending || !stripeSyncEmail.trim()}
                        data-testid="button-stripe-sync"
                      >
                        {stripeSyncMutation.isPending ? (
                          <>
                            <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                            Syncing...
                          </>
                        ) : (
                          <>
                            <Settings className="h-4 w-4 mr-2" />
                            Sync from Stripe
                          </>
                        )}
                      </Button>
                    </div>

                    {stripeSyncResult && (
                      <Alert 
                        variant={stripeSyncResult.success ? "default" : "destructive"}
                        className={stripeSyncResult.success ? "border-green-200 bg-green-50" : ""}
                      >
                        {stripeSyncResult.success ? (
                          <CheckCircle className="h-4 w-4 text-green-600" />
                        ) : (
                          <AlertCircle className="h-4 w-4" />
                        )}
                        <AlertDescription className={stripeSyncResult.success ? "text-green-700" : ""}>
                          {stripeSyncResult.message}
                        </AlertDescription>
                      </Alert>
                    )}
                  </div>

                  {/* Checkout Settings Section */}
                  <Separator className="my-6" />
                  <div className="space-y-4">
                    <div>
                      <h4 className="font-medium mb-1">Checkout Settings</h4>
                      <p className="text-sm text-muted-foreground">
                        Configure how checkout displays payment and subscription information
                      </p>
                    </div>

                    <div className="flex items-center justify-between space-x-2 p-4 border rounded-lg">
                      <div className="space-y-0.5">
                        <Label htmlFor="showSubscriptionStatus">Show Subscription Status</Label>
                        <p className="text-sm text-muted-foreground">
                          Display Stripe subscription status and billing cycle during checkout. 
                          Turn off to simplify checkout or if subscription features are not yet configured.
                        </p>
                      </div>
                      <Switch
                        id="showSubscriptionStatus"
                        checked={schoolData?.showSubscriptionStatus ?? false}
                        onCheckedChange={(checked) => {
                          apiRequest('PATCH', '/api/school-admin/my-school/settings', { showSubscriptionStatus: checked })
                            .then(() => {
                              toast({
                                title: "Success",
                                description: `Subscription status display ${checked ? 'enabled' : 'disabled'}`,
                              });
                              queryClient.invalidateQueries({ queryKey: ['/api/school-admin/my-school'] });
                            })
                            .catch((error) => {
                              toast({
                                title: "Error",
                                description: "Failed to update checkout settings",
                                variant: "destructive",
                              });
                            });
                        }}
                        data-testid="switch-show-subscription-status"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </SchoolAdminLayout>
  );
}