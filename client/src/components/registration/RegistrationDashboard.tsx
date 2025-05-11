import { useState } from "react";
import { ChildrenManagement } from "./ChildrenManagement";
import { EmergencyContactsManagement } from "./EmergencyContactsManagement";
import { ProgramList } from "./ProgramList";
import { EnrollmentList } from "./EnrollmentList";
import { useQuery } from "@tanstack/react-query";

import { 
  Tabs, 
  TabsContent, 
  TabsList, 
  TabsTrigger 
} from "@/components/ui/tabs";
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardHeader, 
  CardTitle 
} from "@/components/ui/card";
import {
  AlertCircle,
  Users,
  PhoneCall,
  Calendar,
  BookOpen
} from "lucide-react";

export function RegistrationDashboard() {
  const [selectedTab, setSelectedTab] = useState("children");

  // Get counts for the dashboard
  const { data: childrenData } = useQuery({
    queryKey: ["/api/children"],
  });
  
  const { data: contactsData } = useQuery({
    queryKey: ["/api/emergency-contacts"],
  });
  
  const { data: enrollmentsData } = useQuery({
    queryKey: ["/api/program-enrollments"],
  });
  
  const { data: programsData } = useQuery({
    queryKey: ["/api/programs"],
    select: (data: any) => data.filter((program: any) => program.isPublished),
  });

  const childrenCount = Array.isArray(childrenData) ? childrenData.length : 0;
  const contactsCount = Array.isArray(contactsData) ? contactsData.length : 0;
  const enrollmentsCount = Array.isArray(enrollmentsData) ? enrollmentsData.length : 0;
  const programsCount = Array.isArray(programsData) ? programsData.length : 0;

  return (
    <div className="flex flex-col space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Registration Dashboard</h1>
        <p className="text-muted-foreground">
          Manage your children, emergency contacts, and program enrollments
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Children Summary Card */}
        <Card 
          className={`cursor-pointer ${selectedTab === "children" ? "border-primary" : ""}`}
          onClick={() => setSelectedTab("children")}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Children</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{childrenCount}</div>
            <p className="text-xs text-muted-foreground">
              {childrenCount === 1 ? "Child" : "Children"} registered
            </p>
          </CardContent>
        </Card>

        {/* Emergency Contacts Summary Card */}
        <Card 
          className={`cursor-pointer ${selectedTab === "contacts" ? "border-primary" : ""}`}
          onClick={() => setSelectedTab("contacts")}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Emergency Contacts</CardTitle>
            <PhoneCall className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{contactsCount}</div>
            <p className="text-xs text-muted-foreground">
              {contactsCount === 1 ? "Contact" : "Contacts"} available
            </p>
          </CardContent>
        </Card>

        {/* Enrollments Summary Card */}
        <Card 
          className={`cursor-pointer ${selectedTab === "enrollments" ? "border-primary" : ""}`}
          onClick={() => setSelectedTab("enrollments")}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Enrollments</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{enrollmentsCount}</div>
            <p className="text-xs text-muted-foreground">
              Active program {enrollmentsCount === 1 ? "enrollment" : "enrollments"}
            </p>
          </CardContent>
        </Card>

        {/* Programs Summary Card */}
        <Card 
          className={`cursor-pointer ${selectedTab === "programs" ? "border-primary" : ""}`}
          onClick={() => setSelectedTab("programs")}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Available Programs</CardTitle>
            <BookOpen className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{programsCount}</div>
            <p className="text-xs text-muted-foreground">
              {programsCount === 1 ? "Program" : "Programs"} available
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tab Content */}
      <Tabs value={selectedTab} onValueChange={setSelectedTab} className="space-y-4">
        <TabsList className="grid grid-cols-4">
          <TabsTrigger value="children">Children</TabsTrigger>
          <TabsTrigger value="contacts">Emergency Contacts</TabsTrigger>
          <TabsTrigger value="enrollments">Enrollments</TabsTrigger>
          <TabsTrigger value="programs">Programs</TabsTrigger>
        </TabsList>

        <TabsContent value="children" className="space-y-4">
          <ChildrenManagement />
        </TabsContent>

        <TabsContent value="contacts" className="space-y-4">
          <EmergencyContactsManagement />
        </TabsContent>

        <TabsContent value="enrollments" className="space-y-4">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">Program Enrollments</h2>
            <p className="text-muted-foreground mb-6">
              View and manage all your children's program enrollments
            </p>
            <EnrollmentList />
          </div>
        </TabsContent>

        <TabsContent value="programs" className="space-y-4">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">Available Programs</h2>
            <p className="text-muted-foreground mb-6">
              Browse and enroll in available programs
            </p>
            <ProgramList />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}