import React from 'react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';

const createUserSchema = z.object({
  firstName: z.string().min(2, 'First name must be at least 2 characters'),
  lastName: z.string().min(2, 'Last name must be at least 2 characters'),
  email: z.string().email('Please enter a valid email address'),
  role: z.enum(['parent', 'educator', 'staff', 'schoolAdmin']),
  phone: z.string().optional(),
  password: z.string().optional(),
  confirmPassword: z.string().optional(),
}).refine((data) => {
  // Skip password validation when editing existing user (password is optional)
  if (!data.password && !data.confirmPassword) return true;
  if (data.password && data.password.length < 6) return false;
  return data.password === data.confirmPassword;
}, {
  message: "Passwords don't match or password is too short",
  path: ["confirmPassword"],
});

type CreateUserForm = z.infer<typeof createUserSchema>;

interface CreateUserDialogProps {
  open: boolean;
  onClose: () => void;
  editUser?: any;
}

export default function CreateUserDialog({ open, onClose, editUser }: CreateUserDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<CreateUserForm>({
    resolver: zodResolver(createUserSchema),
    defaultValues: {
      firstName: editUser?.firstName || '',
      lastName: editUser?.lastName || '',
      email: editUser?.email || '',
      role: editUser?.role || 'parent',
      phone: editUser?.phone || '',
      password: '',
      confirmPassword: '',
    },
  });

  // Update form when editUser changes
  React.useEffect(() => {
    if (editUser) {
      form.reset({
        firstName: editUser.firstName || '',
        lastName: editUser.lastName || '',
        email: editUser.email || '',
        role: editUser.role || 'parent',
        phone: editUser.phone || '',
        password: '',
        confirmPassword: '',
      });
    } else {
      form.reset({
        firstName: '',
        lastName: '',
        email: '',
        role: 'parent',
        phone: '',
        password: '',
        confirmPassword: '',
      });
    }
  }, [editUser, form]);

  const createUserMutation = useMutation({
    mutationFn: async (userData: CreateUserForm) => {
      const { confirmPassword, ...data } = userData;
      // Remove password fields if they're empty (for edit mode)
      if (!data.password) {
        delete data.password;
      }
      
      if (editUser) {
        // Update existing user
        return apiRequest('PUT', `/api/school-admin/users/${editUser.id}`, data);
      } else {
        // Create new user
        return apiRequest('POST', '/api/school-admin/users', data);
      }
    },
    onSuccess: () => {
      toast({
        title: editUser ? 'User Updated' : 'User Created',
        description: editUser 
          ? 'The user account has been updated successfully.'
          : 'The user account has been created successfully.',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/school-admin/users'] });
      form.reset();
      onClose();
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || `Failed to ${editUser ? 'update' : 'create'} user account.`,
        variant: 'destructive',
      });
    },
  });

  const onSubmit = (data: CreateUserForm) => {
    createUserMutation.mutate(data);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{editUser ? 'Edit User' : 'Create New User'}</DialogTitle>
          <DialogDescription>
            {editUser 
              ? 'Update the user account details. Leave password fields empty to keep current password.'
              : 'Add a new user account to your school. They will receive login credentials via email.'
            }
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="firstName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>First Name</FormLabel>
                    <FormControl>
                      <Input placeholder="John" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="lastName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Last Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Smith" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email Address</FormLabel>
                  <FormControl>
                    <Input 
                      type="email" 
                      placeholder="john.smith@example.com" 
                      {...field} 
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="role"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Role</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a role" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="parent">Parent</SelectItem>
                      <SelectItem value="educator">Educator</SelectItem>
                      <SelectItem value="staff">Staff</SelectItem>
                      <SelectItem value="schoolAdmin">School Admin</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="phone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Phone Number (Optional)</FormLabel>
                  <FormControl>
                    <Input placeholder="(555) 123-4567" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Password</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder="••••••••" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="confirmPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Confirm Password</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder="••••••••" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="flex justify-end space-x-2">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={createUserMutation.isPending}
              >
                {createUserMutation.isPending 
                  ? (editUser ? 'Updating...' : 'Creating...') 
                  : (editUser ? 'Update User' : 'Create User')
                }
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}