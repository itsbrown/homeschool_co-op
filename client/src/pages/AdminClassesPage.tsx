import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { DashboardShell } from "../components/ui/dashboard-shell";
import { useAuth } from "../hooks/use-auth";
import { ClassCreationForm } from "../components/admin/ClassCreationForm";
import { Route, Switch, useLocation } from "wouter";
import { apiRequest } from "../lib/queryClient";
import { formatDate } from "../lib/utils";
import { useToast } from "../hooks/use-toast";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "../components/ui/pagination";
import { Badge } from "../components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { Skeleton } from "../components/ui/skeleton";
import {
  Edit,
  MoreHorizontal,
  Plus,
  Search,
  Trash2,
  Calendar,
  Users,
  DollarSign,
  Tag,
  Eye,
  EyeOff,
  Upload,
} from "lucide-react";

export function AdminClassesPage() {
  const { user, isLoading } = useAuth();
  const [location, setLocation] = useLocation();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const isAdmin = user?.role === "admin";

  // If not admin, redirect to home
  if (!isLoading && !isAdmin) {
    setLocation("/");
  }

  // Fetch classes data with filters
  const {
    data: classesData,
    isLoading: isLoadingClasses,
    isError,
  } = useQuery({
    queryKey: ['/api/admin/classes', page, search, category],
    enabled: !!isAdmin,
  });

  // Handle class deletion
  const handleDeleteClass = async (id: number) => {
    if (window.confirm("Are you sure you want to delete this class?")) {
      try {
        await apiRequest("DELETE", `/api/admin/classes/${id}`);
        toast({
          title: "Class deleted",
          description: "The class has been deleted successfully.",
        });
        queryClient.invalidateQueries({ queryKey: ['/api/admin/classes'] });
      } catch (error) {
        console.error("Failed to delete class:", error);
        toast({
          title: "Failed to delete",
          description: "There was an error deleting the class. Please try again.",
          variant: "destructive",
        });
      }
    }
  };

  // Handle publishing toggle
  const handleTogglePublish = async (id: number, currentStatus: boolean) => {
    try {
      await apiRequest("PATCH", `/api/admin/classes/${id}`, {
        isPublished: !currentStatus,
      });
      toast({
        title: currentStatus ? "Class unpublished" : "Class published",
        description: `The class is now ${
          currentStatus ? "hidden from" : "visible to"
        } parents.`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/classes'] });
    } catch (error) {
      console.error("Failed to update class:", error);
      toast({
        title: "Failed to update",
        description: "There was an error updating the class. Please try again.",
        variant: "destructive",
      });
    }
  };

  // Filter handlers
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
    setPage(1); // Reset to first page on search
  };

  const handleCategoryChange = (value: string) => {
    setCategory(value);
    setPage(1); // Reset to first page on category change
  };

  // Navigate to create new class
  const handleCreateClass = () => {
    setLocation("/admin/classes/new");
  };

  // Navigate to edit class
  const handleEditClass = (id: number) => {
    setLocation(`/admin/classes/edit/${id}`);
  };
  
  // Navigate to CSV upload page
  const handleNavigateToUpload = () => {
    setLocation("/admin/classes/upload");
  };

  return (
    <DashboardShell>
      <div className="flex flex-col space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold tracking-tight">Classes</h1>
          <div className="flex items-center gap-2">
            <Button onClick={handleNavigateToUpload} variant="outline" className="flex items-center gap-2">
              <Upload className="h-4 w-4" />
              Upload CSV
            </Button>
            <Button onClick={handleCreateClass} className="flex items-center gap-2">
              <Plus className="h-4 w-4" />
              Create Class
            </Button>
          </div>
        </div>

        <Switch>
          <Route path="/admin/classes">
            {({ matches }) => {
              if (matches) {
                return (
                  <Card>
                    <CardHeader>
                      <CardTitle>Manage Classes</CardTitle>
                      <CardDescription>
                        Create, edit, and publish classes for your educational programs
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <Tabs defaultValue="all" className="space-y-4">
                        <div className="flex flex-col space-y-4 sm:flex-row sm:items-center sm:justify-between sm:space-y-0">
                          <TabsList>
                            <TabsTrigger value="all">All Classes</TabsTrigger>
                            <TabsTrigger value="published">Published</TabsTrigger>
                            <TabsTrigger value="drafts">Drafts</TabsTrigger>
                          </TabsList>
                          <div className="flex items-center space-x-2">
                            <div className="relative w-full sm:w-64">
                              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                              <Input
                                placeholder="Search classes..."
                                className="pl-8"
                                value={search}
                                onChange={handleSearchChange}
                              />
                            </div>
                            <Select value={category} onValueChange={handleCategoryChange}>
                              <SelectTrigger className="w-[110px]">
                                <SelectValue placeholder="Category" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="">All Categories</SelectItem>
                                <SelectItem value="academic">Academic</SelectItem>
                                <SelectItem value="arts">Arts</SelectItem>
                                <SelectItem value="music">Music</SelectItem>
                                <SelectItem value="sports">Sports</SelectItem>
                                <SelectItem value="stem">STEM</SelectItem>
                                <SelectItem value="language">Language</SelectItem>
                                <SelectItem value="coding">Coding</SelectItem>
                                <SelectItem value="cooking">Cooking</SelectItem>
                                <SelectItem value="crafts">Crafts</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>

                        <TabsContent value="all" className="space-y-4">
                          {isLoadingClasses ? (
                            // Loading state
                            <div className="space-y-2">
                              {Array(5)
                                .fill(0)
                                .map((_, i) => (
                                  <Skeleton key={i} className="h-16 w-full" />
                                ))}
                            </div>
                          ) : isError ? (
                            // Error state
                            <div className="flex h-[300px] items-center justify-center rounded-md border border-dashed p-8">
                              <div className="text-center">
                                <p className="text-sm text-muted-foreground">
                                  Error loading classes. Please try again.
                                </p>
                              </div>
                            </div>
                          ) : classesData?.classes?.length > 0 ? (
                            // Data loaded
                            <>
                              <div className="rounded-md border">
                                <Table>
                                  <TableHeader>
                                    <TableRow>
                                      <TableHead className="w-[300px]">Class</TableHead>
                                      <TableHead>Category</TableHead>
                                      <TableHead>Dates</TableHead>
                                      <TableHead>Price</TableHead>
                                      <TableHead>Enrollment</TableHead>
                                      <TableHead>Status</TableHead>
                                      <TableHead className="text-right">Actions</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {classesData.classes.map((classItem: any) => (
                                      <TableRow key={classItem.id}>
                                        <TableCell className="font-medium">
                                          <div className="space-y-1">
                                            <div>{classItem.title}</div>
                                            <div className="text-xs text-muted-foreground">
                                              {classItem.instructorName}
                                            </div>
                                          </div>
                                        </TableCell>
                                        <TableCell>
                                          <Badge variant="outline" className="flex items-center gap-1 capitalize">
                                            <Tag className="h-3 w-3" />
                                            {classItem.category}
                                          </Badge>
                                        </TableCell>
                                        <TableCell>
                                          <div className="flex items-center gap-1 text-xs">
                                            <Calendar className="h-3 w-3" />
                                            <div>
                                              {formatDate(classItem.startDate)} - {formatDate(classItem.endDate)}
                                            </div>
                                          </div>
                                        </TableCell>
                                        <TableCell>
                                          <div className="flex items-center gap-1">
                                            <DollarSign className="h-3 w-3" />
                                            {classItem.price.toFixed(2)}
                                          </div>
                                        </TableCell>
                                        <TableCell>
                                          <div className="flex items-center gap-1">
                                            <Users className="h-3 w-3" />
                                            {classItem.enrollmentCount || 0}/{classItem.capacity}
                                          </div>
                                        </TableCell>
                                        <TableCell>
                                          <Badge
                                            variant={classItem.isPublished ? "default" : "secondary"}
                                          >
                                            {classItem.isPublished ? "Published" : "Draft"}
                                          </Badge>
                                        </TableCell>
                                        <TableCell className="text-right">
                                          <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                              <Button
                                                variant="ghost"
                                                className="h-8 w-8 p-0"
                                              >
                                                <span className="sr-only">Open menu</span>
                                                <MoreHorizontal className="h-4 w-4" />
                                              </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end">
                                              <DropdownMenuItem
                                                onClick={() => handleEditClass(classItem.id)}
                                              >
                                                <Edit className="mr-2 h-4 w-4" />
                                                Edit
                                              </DropdownMenuItem>
                                              <DropdownMenuItem
                                                onClick={() =>
                                                  handleTogglePublish(
                                                    classItem.id,
                                                    classItem.isPublished
                                                  )
                                                }
                                              >
                                                {classItem.isPublished ? (
                                                  <>
                                                    <EyeOff className="mr-2 h-4 w-4" />
                                                    Unpublish
                                                  </>
                                                ) : (
                                                  <>
                                                    <Eye className="mr-2 h-4 w-4" />
                                                    Publish
                                                  </>
                                                )}
                                              </DropdownMenuItem>
                                              <DropdownMenuItem
                                                className="text-destructive focus:text-destructive"
                                                onClick={() => handleDeleteClass(classItem.id)}
                                              >
                                                <Trash2 className="mr-2 h-4 w-4" />
                                                Delete
                                              </DropdownMenuItem>
                                            </DropdownMenuContent>
                                          </DropdownMenu>
                                        </TableCell>
                                      </TableRow>
                                    ))}
                                  </TableBody>
                                </Table>
                              </div>

                              {/* Pagination */}
                              <Pagination>
                                <PaginationContent>
                                  <PaginationItem>
                                    <PaginationPrevious
                                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                                      disabled={page === 1}
                                    />
                                  </PaginationItem>
                                  <PaginationItem>
                                    <span className="px-4 py-1 text-sm">
                                      Page {page} of {classesData.totalPages || 1}
                                    </span>
                                  </PaginationItem>
                                  <PaginationItem>
                                    <PaginationNext
                                      onClick={() => setPage((p) => p + 1)}
                                      disabled={page === (classesData.totalPages || 1)}
                                    />
                                  </PaginationItem>
                                </PaginationContent>
                              </Pagination>
                            </>
                          ) : (
                            // Empty state
                            <div className="flex h-[300px] flex-col items-center justify-center rounded-md border border-dashed p-8">
                              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-muted">
                                <Calendar className="h-10 w-10 text-muted-foreground" />
                              </div>
                              <h3 className="mt-4 text-lg font-semibold">No classes found</h3>
                              <p className="mb-4 mt-2 text-center text-sm text-muted-foreground">
                                {search || category
                                  ? "Try adjusting your search or filters"
                                  : "Get started by creating your first class"}
                              </p>
                              <Button onClick={handleCreateClass} className="flex items-center gap-2">
                                <Plus className="h-4 w-4" />
                                Create Class
                              </Button>
                            </div>
                          )}
                        </TabsContent>
                      </Tabs>
                    </CardContent>
                  </Card>
                );
              }
              return null;
            }}
          </Route>

          <Route path="/admin/classes/new">
            {({ matches }) => {
              if (matches) {
                return (
                  <Card>
                    <CardHeader>
                      <CardTitle>Create New Class</CardTitle>
                      <CardDescription>
                        Fill out the form below to create a new class for your program
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <ClassCreationForm
                        onSuccess={() => setLocation("/admin/classes")}
                      />
                    </CardContent>
                  </Card>
                );
              }
              return null;
            }}
          </Route>

          <Route path="/admin/classes/edit/:id">
            {(params) => {
              const classId = params.id ? parseInt(params.id) : undefined;
              
              return (
                <Card>
                  <CardHeader>
                    <CardTitle>Edit Class</CardTitle>
                    <CardDescription>
                      Update the details for this class
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ClassCreationForm
                      classId={classId}
                      onSuccess={() => setLocation("/admin/classes")}
                    />
                  </CardContent>
                </Card>
              );
            }}
          </Route>
          
          <Route path="/admin/classes/upload">
            {({ matches }) => {
              if (matches) {
                const ClassesUploadPage = require("../pages/admin/ClassesUploadPage").default;
                return <ClassesUploadPage />;
              }
              return null;
            }}
          </Route>
        </Switch>
      </div>
    </DashboardShell>
  );
}