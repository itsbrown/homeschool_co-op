import { useState, useEffect } from 'react';
import { useRoute, useLocation } from 'wouter';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Upload, X, ShoppingCart, CreditCard } from 'lucide-react';

interface FormField {
  id: number;
  fieldType: string;
  label: string;
  placeholder: string | null;
  helpText: string | null;
  isRequired: boolean;
  order: number;
  fieldConfig: any;
}

interface CustomForm {
  id: number;
  title: string;
  description: string | null;
  fields: FormField[];
  settings: any;
  platformFeeType: string;
  platformFeeAmount: number;
}

interface User {
  id: number;
  email: string;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
}

const shippingSchema = z.object({
  address: z.string().min(1, 'Address is required'),
  city: z.string().min(1, 'City is required'),
  state: z.string().min(2, 'State is required'),
  zipCode: z.string().min(5, 'ZIP code is required'),
});

export default function ProductOrderFormPage() {
  const [, params] = useRoute('/product-order/:slug');
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const slug = params?.slug || '';
  
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [orderItems, setOrderItems] = useState<Record<number, number>>({});
  const [selectedVariants, setSelectedVariants] = useState<Record<number, number>>({});  // fieldId -> variant index

  // Fetch form by slug (using authenticated endpoint for members-only forms)
  const { data: form, isLoading: formLoading } = useQuery<CustomForm>({
    queryKey: [`/api/custom-forms/forms/by-slug-auth/${slug}`],
    enabled: !!slug,
  });

  // Fetch current user (assuming we have auth)
  const { data: user } = useQuery<User>({
    queryKey: ['/api/user/profile'],
  });

  const shippingForm = useForm({
    resolver: zodResolver(shippingSchema),
    defaultValues: {
      address: '',
      city: '',
      state: '',
      zipCode: '',
    },
  });

  // Auto-fill shipping address from user profile
  useEffect(() => {
    if (user) {
      shippingForm.reset({
        address: user.address || '',
        city: user.city || '',
        state: user.state || '',
        zipCode: user.zipCode || '',
      });
    }
  }, [user, shippingForm]);

  // Calculate totals
  const calculateTotals = () => {
    if (!form) return { subtotal: 0, platformFee: 0, total: 0 };

    const priceFields = form.fields.filter(f => f.fieldType === 'price');
    const quantityFields = form.fields.filter(f => f.fieldType === 'quantity');
    const productFields = form.fields.filter(f => f.fieldType === 'product');

    let subtotal = 0;
    let itemCount = 0;

    // Handle old-style quantity/price pairs
    priceFields.forEach(priceField => {
      const quantityField = quantityFields.find(qf => 
        qf.label.toLowerCase().includes(priceField.label.toLowerCase().split(' ')[0])
      );
      
      if (quantityField) {
        const quantity = orderItems[quantityField.id] || 0;
        const price = parseFloat(priceField.fieldConfig?.defaultValue || '0');
        
        if (quantity > 0) {
          subtotal += price * quantity;
          itemCount += quantity; // Count actual units, not just line items
        }
      }
    });

    // Handle new product fields with variants
    productFields.forEach(field => {
      const quantity = orderItems[field.id] || 0;
      if (quantity > 0) {
        const variantIndex = selectedVariants[field.id] || 0;
        const variant = field.fieldConfig?.variants?.[variantIndex];
        const price = variant ? variant.price / 100 : (field.fieldConfig?.price || 0) / 100;
        
        subtotal += price * quantity;
        itemCount += quantity; // Count actual units, not just line items
      }
    });

    let platformFee = 0;
    if (form.platformFeeType === 'flat_per_item') {
      platformFee = (form.platformFeeAmount * itemCount) / 100; // Fee per actual unit
    } else if (form.platformFeeType === 'percentage') {
      platformFee = (subtotal * form.platformFeeAmount) / 100;
    }

    const total = subtotal + platformFee;

    return { subtotal, platformFee, total };
  };

  const { subtotal, platformFee, total } = calculateTotals();

  // Handle image upload
  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    
    if (imageFiles.length + files.length > 3) {
      toast({
        title: 'Too many images',
        description: 'You can upload a maximum of 3 images',
        variant: 'destructive',
      });
      return;
    }

    // Validate file types and sizes
    const validFiles = files.filter(file => {
      if (!file.type.startsWith('image/')) {
        toast({
          title: 'Invalid file type',
          description: `${file.name} is not an image`,
          variant: 'destructive',
        });
        return false;
      }
      if (file.size > 5 * 1024 * 1024) {
        toast({
          title: 'File too large',
          description: `${file.name} exceeds 5MB limit`,
          variant: 'destructive',
        });
        return false;
      }
      return true;
    });

    setImageFiles([...imageFiles, ...validFiles]);

    // Generate previews
    validFiles.forEach(file => {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreviews(prev => [...prev, reader.result as string]);
      };
      reader.readAsDataURL(file);
    });
  };

  const removeImage = (index: number) => {
    setImageFiles(imageFiles.filter((_, i) => i !== index));
    setImagePreviews(imagePreviews.filter((_, i) => i !== index));
  };

  // Upload images mutation (with Supabase authentication)
  const uploadImagesMutation = useMutation({
    mutationFn: async (files: File[]) => {
      const formData = new FormData();
      files.forEach(file => {
        formData.append('images', file);
      });

      // Get Supabase access token from localStorage
      const token = localStorage.getItem('supabase_token');
      
      const response = await fetch('/api/upload/product-images', {
        method: 'POST',
        headers: {
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Failed to upload images');
      }

      return response.json();
    },
  });

  // Submit order mutation
  const submitOrderMutation = useMutation({
    mutationFn: async (data: any) => {
      // First upload images
      let imageUrls: string[] = [];
      if (imageFiles.length > 0) {
        const uploadResult = await uploadImagesMutation.mutateAsync(imageFiles);
        imageUrls = uploadResult.images.map((img: any) => img.url);
      }

      // Prepare order data with variant information
      const orderData = {
        responseData: {
          items: data.items,
          variants: data.variants || {},
        },
        shippingAddress: data.shipping,
        productImages: imageUrls,
        subtotal: Math.round(subtotal * 100), // Convert to cents
        platformFee: Math.round(platformFee * 100),
        totalAmount: Math.round(total * 100),
        paymentStatus: 'pending',
      };

      const response = await apiRequest('POST', `/api/custom-forms/forms/${form?.id}/submit-auth`, orderData);
      return response.json();
    },
    onSuccess: (submission) => {
      toast({ title: 'Order submitted!', description: 'Redirecting to payment...' });
      // Navigate to payment page with submission ID
      navigate(`/payment/${submission.id}`);
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error?.message || 'Failed to submit order',
        variant: 'destructive',
      });
    },
  });

  const handleSubmit = async () => {
    const shippingData = shippingForm.getValues();
    
    // Validate shipping address
    const shippingValid = await shippingForm.trigger();
    if (!shippingValid) {
      toast({
        title: 'Invalid shipping address',
        description: 'Please fill in all required fields',
        variant: 'destructive',
      });
      return;
    }

    // Validate that at least one item is selected
    if (Object.values(orderItems).every(qty => qty === 0)) {
      toast({
        title: 'No items selected',
        description: 'Please select at least one item',
        variant: 'destructive',
      });
      return;
    }

    submitOrderMutation.mutate({
      items: orderItems,
      variants: selectedVariants,
      shipping: shippingData,
    });
  };

  if (formLoading || !form) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full"></div>
      </div>
    );
  }

  const quantityFields = form.fields.filter(f => f.fieldType === 'quantity');
  const priceFields = form.fields.filter(f => f.fieldType === 'price');
  const productFields = form.fields.filter(f => f.fieldType === 'product');

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="container mx-auto px-4 max-w-4xl">
        <Card>
          <CardHeader>
            <CardTitle className="text-3xl">{form.title}</CardTitle>
            {form.description && <CardDescription>{form.description}</CardDescription>}
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Product Selection */}
            <div className="space-y-4">
              <h3 className="text-xl font-semibold flex items-center gap-2">
                <ShoppingCart className="h-5 w-5" />
                Select Products
              </h3>
              <div className="grid gap-4">
                {/* New product field type with variants */}
                {productFields.map(field => {
                  const variants = field.fieldConfig?.variants || [];
                  const selectedVariantIndex = selectedVariants[field.id] || 0;
                  const selectedVariant = variants[selectedVariantIndex];
                  const price = selectedVariant ? selectedVariant.price / 100 : (field.fieldConfig?.price || 0) / 100;
                  const maxQuantity = field.fieldConfig?.maxQuantity || 10;
                  
                  return (
                    <div key={field.id} className="border rounded-lg p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1">
                          <h4 className="font-medium text-lg">{field.label}</h4>
                          {field.fieldConfig?.description && (
                            <p className="text-sm text-muted-foreground mt-1">{field.fieldConfig.description}</p>
                          )}
                        </div>
                        <p className="text-xl font-semibold text-primary">
                          ${price.toFixed(2)}
                        </p>
                      </div>
                      
                      {variants.length > 0 && (
                        <div className="mb-3">
                          <Label className="text-sm mb-2 block">Select Variant</Label>
                          <select
                            value={selectedVariantIndex}
                            onChange={(e) => setSelectedVariants({ ...selectedVariants, [field.id]: parseInt(e.target.value) })}
                            className="w-full border rounded-md p-2 text-sm"
                            data-testid={`select-variant-${field.id}`}
                          >
                            {variants.map((variant: any, index: number) => (
                              <option key={index} value={index}>
                                {variant.name} - ${(variant.price / 100).toFixed(2)}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                      
                      <div className="flex items-center gap-2">
                        <Label htmlFor={`qty-${field.id}`} className="text-sm">Quantity:</Label>
                        <Input
                          id={`qty-${field.id}`}
                          type="number"
                          min="0"
                          max={maxQuantity}
                          value={orderItems[field.id] || 0}
                          onChange={(e) => setOrderItems({ ...orderItems, [field.id]: parseInt(e.target.value) || 0 })}
                          className="w-24"
                          data-testid={`input-quantity-${field.id}`}
                        />
                        <span className="text-sm text-muted-foreground">
                          (max: {maxQuantity})
                        </span>
                      </div>
                    </div>
                  );
                })}

                {/* Legacy quantity/price fields */}
                {quantityFields.map(field => {
                  const priceField = priceFields.find(pf => 
                    pf.label.toLowerCase().includes(field.label.toLowerCase().split(' ')[0])
                  );
                  const price = parseFloat(priceField?.fieldConfig?.defaultValue || '0');
                  
                  return (
                    <div key={field.id} className="border rounded-lg p-4 flex items-center justify-between">
                      <div className="flex-1">
                        <h4 className="font-medium">{field.label}</h4>
                        {field.helpText && <p className="text-sm text-muted-foreground">{field.helpText}</p>}
                        <p className="text-lg font-semibold text-primary mt-1">
                          ${price.toFixed(2)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Label htmlFor={`qty-${field.id}`} className="text-sm">Quantity:</Label>
                        <Input
                          id={`qty-${field.id}`}
                          type="number"
                          min="0"
                          max="999"
                          value={orderItems[field.id] || 0}
                          onChange={(e) => setOrderItems({ ...orderItems, [field.id]: parseInt(e.target.value) || 0 })}
                          className="w-20"
                          data-testid={`input-quantity-${field.id}`}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Image Upload */}
            <div className="space-y-4">
              <h3 className="text-xl font-semibold flex items-center gap-2">
                <Upload className="h-5 w-5" />
                Product Images (Optional, max 3)
              </h3>
              <div className="border-2 border-dashed rounded-lg p-6 text-center">
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleImageSelect}
                  className="hidden"
                  id="image-upload"
                  data-testid="input-image-upload"
                />
                <label
                  htmlFor="image-upload"
                  className="cursor-pointer flex flex-col items-center gap-2"
                >
                  <Upload className="h-8 w-8 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    Click to upload images ({imageFiles.length}/3)
                  </p>
                </label>
              </div>
              
              {imagePreviews.length > 0 && (
                <div className="grid grid-cols-3 gap-4">
                  {imagePreviews.map((preview, index) => (
                    <div key={index} className="relative group">
                      <img
                        src={preview}
                        alt={`Preview ${index + 1}`}
                        className="w-full h-32 object-cover rounded-lg"
                      />
                      <button
                        onClick={() => removeImage(index)}
                        className="absolute top-2 right-2 bg-destructive text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                        data-testid={`button-remove-image-${index}`}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Shipping Address */}
            <div className="space-y-4">
              <h3 className="text-xl font-semibold">Shipping Address</h3>
              <Form {...shippingForm}>
                <div className="grid gap-4">
                  <FormField
                    control={shippingForm.control}
                    name="address"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Street Address</FormLabel>
                        <FormControl>
                          <Input {...field} data-testid="input-address" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="grid grid-cols-3 gap-4">
                    <FormField
                      control={shippingForm.control}
                      name="city"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>City</FormLabel>
                          <FormControl>
                            <Input {...field} data-testid="input-city" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={shippingForm.control}
                      name="state"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>State</FormLabel>
                          <FormControl>
                            <Input {...field} maxLength={2} data-testid="input-state" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={shippingForm.control}
                      name="zipCode"
                      render={({ field}) => (
                        <FormItem>
                          <FormLabel>ZIP Code</FormLabel>
                          <FormControl>
                            <Input {...field} data-testid="input-zip" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>
              </Form>
            </div>

            {/* Order Summary */}
            <div className="border-t pt-6">
              <h3 className="text-xl font-semibold flex items-center gap-2 mb-4">
                <CreditCard className="h-5 w-5" />
                Order Summary
              </h3>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Subtotal:</span>
                  <span>${subtotal.toFixed(2)}</span>
                </div>
                {platformFee > 0 && (
                  <div className="flex justify-between text-sm">
                    <span>Platform Fee:</span>
                    <span>${platformFee.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between text-lg font-bold border-t pt-2">
                  <span>Total:</span>
                  <span data-testid="text-total">${total.toFixed(2)}</span>
                </div>
              </div>
            </div>

            {/* Submit Button */}
            <Button
              onClick={handleSubmit}
              disabled={submitOrderMutation.isPending || total === 0}
              className="w-full"
              size="lg"
              data-testid="button-submit-order"
            >
              {submitOrderMutation.isPending ? 'Processing...' : 'Proceed to Payment'}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
