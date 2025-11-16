import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Category } from '@shared/schema'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/use-toast'
import { useSchoolAdmin } from '@/hooks/useSchoolAdmin'
import { PlusCircle, Trash2, Edit, Power, Tag } from 'lucide-react'
import { apiRequest } from '@/lib/queryClient'

export default function CategoriesManagementPage() {
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [editingCategory, setEditingCategory] = useState<Category | null>(null)
  const { toast } = useToast()
  const queryClient = useQueryClient()

  // Get authenticated user's schoolId
  const { schoolId, hasSchool } = useSchoolAdmin()

  // Fetch categories for school
  const { data: categoriesData, isLoading: isLoadingCategories, error: categoriesError } = useQuery({
    queryKey: ['/api/school-admin/categories'],
    retry: false
  })

  // Create category mutation
  const createCategoryMutation = useMutation({
    mutationFn: (categoryData: any) => 
      apiRequest('POST', '/api/school-admin/categories', categoryData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/school-admin/categories'] })
      queryClient.refetchQueries({ queryKey: ['/api/school-admin/categories'] })
      setIsAddDialogOpen(false)
      toast({
        title: "Success",
        description: "Category created successfully",
      })
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create category",
        variant: "destructive",
      })
    }
  })

  const handleCreateCategory = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    
    if (!hasSchool || !schoolId) {
      toast({
        title: "Error",
        description: "Unable to determine your school. Please ensure you're logged in as a school administrator.",
        variant: "destructive",
      })
      return
    }
    
    const categoryData = {
      schoolId: schoolId,
      name: formData.get('name') as string,
      description: formData.get('description') as string || undefined,
      isActive: true
    }

    createCategoryMutation.mutate(categoryData)
  }

  // Delete category mutation (soft delete)
  const deleteCategoryMutation = useMutation({
    mutationFn: (categoryId: number) => 
      apiRequest('DELETE', `/api/school-admin/categories/${categoryId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/school-admin/categories'] })
      queryClient.refetchQueries({ queryKey: ['/api/school-admin/categories'] })
      toast({
        title: "Success",
        description: "Category deleted successfully",
      })
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete category",
        variant: "destructive",
      })
    }
  })

  const handleDeleteCategory = (category: Category) => {
    if (window.confirm(`Are you sure you want to delete "${category.name}"? This action will deactivate the category but preserve historical data.`)) {
      deleteCategoryMutation.mutate(category.id)
    }
  }

  // Status toggle mutation
  const toggleStatusMutation = useMutation({
    mutationFn: ({ id, newStatus }: { id: number; newStatus: boolean }) => 
      apiRequest('PUT', `/api/school-admin/categories/${id}`, { isActive: newStatus }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/school-admin/categories'] })
      queryClient.refetchQueries({ queryKey: ['/api/school-admin/categories'] })
      toast({
        title: "Success",
        description: "Category status updated successfully",
      })
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update category status",
        variant: "destructive",
      })
    }
  })

  const handleToggleStatus = (category: Category) => {
    const newStatus = !category.isActive
    const actionText = newStatus ? 'activate' : 'deactivate'
    
    if (window.confirm(`Are you sure you want to ${actionText} "${category.name}"?`)) {
      toggleStatusMutation.mutate({ id: category.id, newStatus })
    }
  }

  // Update category mutation
  const updateCategoryMutation = useMutation({
    mutationFn: ({ id, categoryData }: { id: number; categoryData: any }) => 
      apiRequest('PUT', `/api/school-admin/categories/${id}`, categoryData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/school-admin/categories'] })
      queryClient.refetchQueries({ queryKey: ['/api/school-admin/categories'] })
      setIsEditDialogOpen(false)
      setEditingCategory(null)
      toast({
        title: "Success",
        description: "Category updated successfully",
      })
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update category",
        variant: "destructive",
      })
    }
  })

  const handleEditCategory = (category: Category) => {
    setEditingCategory(category)
    setIsEditDialogOpen(true)
  }

  const handleUpdateCategory = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!editingCategory) return

    const formData = new FormData(e.currentTarget)
    
    const categoryData = {
      name: formData.get('name') as string,
      description: formData.get('description') as string || undefined,
    }

    updateCategoryMutation.mutate({ id: editingCategory.id, categoryData })
  }

  if (isLoadingCategories) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
            <p className="text-muted-foreground mt-4">Loading categories...</p>
          </div>
        </div>
      </div>
    )
  }

  if (categoriesError) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-red-600">Error Loading Categories</CardTitle>
            <CardDescription>There was a problem loading your category data.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Please try refreshing the page or contact support if the problem persists.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  const categories: Category[] = (categoriesData as { categories?: Category[] })?.categories || []

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-6 md:space-y-8">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Category Management</h1>
          <p className="text-muted-foreground text-sm md:text-base">
            Manage class categories for your school
          </p>
        </div>
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-category">
              <PlusCircle className="mr-2 h-4 w-4" />
              <span className="hidden sm:inline">Add Category</span>
              <span className="sm:hidden">Add</span>
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>Add New Category</DialogTitle>
              <DialogDescription>
                Create a new category for organizing classes.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreateCategory} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Category Name *</Label>
                <Input
                  id="name"
                  name="name"
                  placeholder="e.g., Early Childhood, High School"
                  required
                  data-testid="input-category-name"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  name="description"
                  placeholder="Optional description of this category"
                  rows={3}
                  data-testid="input-category-description"
                />
              </div>
              
              <div className="flex justify-end space-x-2 pt-4">
                <Button type="button" variant="outline" onClick={() => setIsAddDialogOpen(false)} data-testid="button-cancel">
                  Cancel
                </Button>
                <Button type="submit" disabled={createCategoryMutation.isPending} data-testid="button-submit">
                  {createCategoryMutation.isPending ? "Creating..." : "Create Category"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
        
        {/* Edit Category Dialog */}
        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>Edit Category</DialogTitle>
              <DialogDescription>
                Update the category information.
              </DialogDescription>
            </DialogHeader>
            {editingCategory && (
              <form onSubmit={handleUpdateCategory} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-name">Category Name *</Label>
                  <Input
                    id="edit-name"
                    name="name"
                    defaultValue={editingCategory.name}
                    required
                    data-testid="input-edit-category-name"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="edit-description">Description</Label>
                  <Textarea
                    id="edit-description"
                    name="description"
                    defaultValue={editingCategory.description || ''}
                    rows={3}
                    data-testid="input-edit-category-description"
                  />
                </div>
                
                <div className="flex justify-end space-x-2 pt-4">
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={() => setIsEditDialogOpen(false)}
                    data-testid="button-cancel-edit"
                  >
                    Cancel
                  </Button>
                  <Button 
                    type="submit" 
                    disabled={updateCategoryMutation.isPending}
                    data-testid="button-submit-edit"
                  >
                    {updateCategoryMutation.isPending ? "Updating..." : "Update Category"}
                  </Button>
                </div>
              </form>
            )}
          </DialogContent>
        </Dialog>
      </div>

      {/* Categories Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Tag className="h-5 w-5" />
            All Categories
          </CardTitle>
          <CardDescription>
            {categories.length} {categories.length === 1 ? 'category' : 'categories'} configured
          </CardDescription>
        </CardHeader>
        <CardContent>
          {categories.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Tag className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No categories found</p>
              <p className="text-sm">Click "Add Category" to create your first category</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead className="hidden md:table-cell">Description</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {categories.map((category) => (
                    <TableRow key={category.id} data-testid={`row-category-${category.id}`}>
                      <TableCell className="font-medium" data-testid={`text-category-name-${category.id}`}>
                        {category.name}
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-muted-foreground">
                        {category.description || <span className="italic text-gray-400">No description</span>}
                      </TableCell>
                      <TableCell>
                        <Badge 
                          variant={category.isActive ? "default" : "secondary"}
                          data-testid={`badge-status-${category.id}`}
                        >
                          {category.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEditCategory(category)}
                            title="Edit category"
                            data-testid={`button-edit-${category.id}`}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleToggleStatus(category)}
                            title={category.isActive ? 'Deactivate' : 'Activate'}
                            data-testid={`button-toggle-${category.id}`}
                          >
                            <Power className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteCategory(category)}
                            title="Delete category"
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                            data-testid={`button-delete-${category.id}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
