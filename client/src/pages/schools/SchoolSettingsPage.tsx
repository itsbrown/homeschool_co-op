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
  CheckCircle
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
  };
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
  const { user, signOut } = useAuth();
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
  const { data: profileData, isLoading: profileLoading } = useQuery({
    queryKey: ['/api/users/profile'],
    enabled: !!user,
  });

  // Fetch notification settings
  const { data: notificationData, isLoading: notificationLoading } = useQuery({
    queryKey: ['/api/users/notifications'],
    enabled: !!user,
  });

  // Initialize form with profile data
  useEffect(() => {
    if (profileData) {
      setFirstName(profileData.firstName || "");
      setLastName(profileData.lastName || "");
      setPhoneNumber(profileData.phoneNumber || "");
      setUsername(profileData.username || profileData.email || "");
    }
  }, [profileData]);

  // Initialize notification settings
  useEffect(() => {
    if (notificationData) {
      setNotifications(notificationData);
    }
  }, [notificationData]);

  // Update profile mutation
  const updateProfileMutation = useMutation({
    mutationFn: async (profileData: {
      firstName: string;
      lastName: string;
      phoneNumber: string;
      username: string;
    }) => {
      return apiRequest('/api/users/profile', {
        method: 'PATCH',
        body: JSON.stringify(profileData),
      });
    },
    onSuccess: () => {
      toast({
        title: "Profile updated",
        description: "Your profile information has been saved successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/users/profile'] });
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
      return apiRequest('/api/users/notifications', {
        method: 'PATCH',
        body: JSON.stringify(notificationSettings),
      });
    },
    onSuccess: () => {
      toast({
        title: "Notifications updated",
        description: "Your notification preferences have been saved.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/users/notifications'] });
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
      return apiRequest('/api/users/change-password', {
        method: 'POST',
        body: JSON.stringify(passwordData),
      });
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

  return (
    <SchoolAdminLayout>
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
                      <AvatarImage src={user?.picture} alt={user?.name || ""} />
                      <AvatarFallback className="text-lg">
                        {user?.name?.charAt(0)?.toUpperCase() || "U"}
                      </AvatarFallback>
                    </Avatar>
                    <div className="space-y-1">
                      <h3 className="font-semibold text-lg">{user?.name}</h3>
                      <p className="text-muted-foreground">{user?.email}</p>
                      <Badge variant="secondary">
                        {user?.role === 'school_admin' ? 'School Administrator' : 'Staff Member'}
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
                  {profileData?.school ? (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between p-4 border rounded-lg">
                        <div>
                          <h3 className="font-semibold">{profileData.school.name}</h3>
                          <p className="text-sm text-muted-foreground">
                            School ID: {profileData.school.id}
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
                  ) : (
                    <Alert>
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>
                        No school association found. Please contact support if you believe this is an error.
                      </AlertDescription>
                    </Alert>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </SchoolAdminLayout>
  );
}