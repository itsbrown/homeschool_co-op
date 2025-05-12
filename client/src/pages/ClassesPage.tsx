import React, { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { DashboardShell } from "@/components/ui/dashboard-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Calendar as CalendarIcon, DollarSign, Book, Users, Filter } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";

// Format currency
const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2
  }).format(amount);
};

export default function ClassesPage() {
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [categoryNameFilter, setCategoryNameFilter] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  
  // Fetch categories
  const { data: categories } = useQuery({
    queryKey: ["/api/classes/categories/names"],
    enabled: true,
  });
  
  // Fetch classes with filters
  const { data: classesData, isLoading } = useQuery({
    queryKey: ["/api/classes", { page: currentPage, limit: 12, search: searchTerm, category: categoryFilter, categoryName: categoryNameFilter }],
    enabled: true,
  });
  
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    // The query will be refetched automatically due to the queryKey change
  };
  
  const clearFilters = () => {
    setSearchTerm("");
    setCategoryFilter("");
    setCategoryNameFilter("");
    setCurrentPage(1);
  };
  
  return (
    <DashboardShell>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">Classes</h1>
          <p className="text-muted-foreground">Browse and register for classes</p>
        </div>
      </div>
      
      <Card className="mb-6">
        <CardHeader className="pb-3">
          <CardTitle>Search & Filter</CardTitle>
          <CardDescription>Find the perfect class</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSearch} className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="md:col-span-2">
              <Label htmlFor="search">Search</Label>
              <Input
                id="search"
                placeholder="Search by title or description"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            
            <div>
              <Label htmlFor="category">Category</Label>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger id="category">
                  <SelectValue placeholder="Any category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Any category</SelectItem>
                  <SelectItem value="academic">Academic</SelectItem>
                  <SelectItem value="membership">Membership</SelectItem>
                  <SelectItem value="summer-camp">Summer Camp</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <Label htmlFor="categoryName">Program</Label>
              <Select value={categoryNameFilter} onValueChange={setCategoryNameFilter}>
                <SelectTrigger id="categoryName">
                  <SelectValue placeholder="Any program" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Any program</SelectItem>
                  {categories && categories.map((cat: string) => (
                    <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="md:col-span-4 flex justify-end gap-2">
              {(searchTerm || categoryFilter || categoryNameFilter) && (
                <Button variant="outline" type="button" onClick={clearFilters}>
                  Clear Filters
                </Button>
              )}
              <Button type="submit">Search</Button>
            </div>
          </form>
        </CardContent>
      </Card>
      
      {isLoading ? (
        <div className="flex justify-center items-center py-12">
          <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full"></div>
          <span className="ml-2">Loading classes...</span>
        </div>
      ) : classesData && classesData.classes.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {classesData.classes.map((classItem: any) => (
            <Card key={classItem.id} className="flex flex-col h-full">
              <CardHeader className="pb-3">
                <div className="flex justify-between">
                  <CardTitle className="line-clamp-2">{classItem.title}</CardTitle>
                  <Badge variant={classItem.category === "academic" ? "default" : 
                          classItem.category === "membership" ? "secondary" : 
                          classItem.category === "summer-camp" ? "outline" : "default"}>
                    {classItem.category}
                  </Badge>
                </div>
                <CardDescription className="line-clamp-2">{classItem.description || "No description provided"}</CardDescription>
              </CardHeader>
              <CardContent className="flex-1">
                <div className="space-y-3 text-sm">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center"><DollarSign className="h-4 w-4 mr-1 opacity-70" />Price:</div>
                    <div className="font-semibold">{formatCurrency(classItem.price / 100)}</div>
                  </div>
                  
                  {classItem.totalOrders > 0 && (
                    <div className="flex items-center justify-between">
                      <div className="flex items-center"><Users className="h-4 w-4 mr-1 opacity-70" />Enrolled:</div>
                      <div className="font-medium">{classItem.totalOrders}</div>
                    </div>
                  )}
                  
                  {classItem.numSessions && (
                    <div className="flex items-center justify-between">
                      <div className="flex items-center"><Book className="h-4 w-4 mr-1 opacity-70" />Sessions:</div>
                      <div className="font-medium">{classItem.numSessions}</div>
                    </div>
                  )}
                  
                  {classItem.startDate && classItem.endDate && (
                    <div className="flex items-center justify-between">
                      <div className="flex items-center"><CalendarIcon className="h-4 w-4 mr-1 opacity-70" />Dates:</div>
                      <div className="font-medium">
                        {new Date(classItem.startDate).toLocaleDateString()} - {new Date(classItem.endDate).toLocaleDateString()}
                      </div>
                    </div>
                  )}
                  
                  {classItem.categoryName && (
                    <div className="flex items-center justify-between">
                      <div className="flex items-center"><Filter className="h-4 w-4 mr-1 opacity-70" />Program:</div>
                      <div className="font-medium">{classItem.categoryName}</div>
                    </div>
                  )}
                </div>
              </CardContent>
              <CardFooter className="pt-0">
                <Button className="w-full">Register</Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-12">
          <Book className="h-16 w-16 text-muted-foreground mb-4" />
          <h3 className="text-xl font-medium">No classes found</h3>
          <p className="text-muted-foreground mt-2">
            Try adjusting your search filters
          </p>
        </div>
      )}
      
      {classesData && classesData.pagination && classesData.pagination.totalPages > 1 && (
        <div className="flex justify-center mt-8">
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
            >
              Previous
            </Button>
            <Button variant="outline" disabled>
              Page {currentPage} of {classesData.pagination.totalPages}
            </Button>
            <Button 
              variant="outline" 
              onClick={() => setCurrentPage(p => Math.min(classesData.pagination.totalPages, p + 1))}
              disabled={currentPage === classesData.pagination.totalPages}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </DashboardShell>
  );
}