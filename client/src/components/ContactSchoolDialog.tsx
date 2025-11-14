import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Mail, Phone, Globe, MapPin, Loader2, Building2 } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';

interface ContactSchoolDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

interface SchoolContact {
  name: string;
  email: string;
  phoneNumber?: string;
  website?: string;
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  logo?: string | null;
}

export default function ContactSchoolDialog({ isOpen, onClose }: ContactSchoolDialogProps) {
  const [logoLoadFailed, setLogoLoadFailed] = useState(false);
  
  const { data, isLoading, error } = useQuery({
    queryKey: ['/api/school-parents/my-school-contact'],
    enabled: isOpen,
    staleTime: 300000, // Cache for 5 minutes
  });

  const school = data?.school as SchoolContact | undefined;
  const hasAddress = school?.address && school?.city && school?.state;
  
  const handleLogoError = () => {
    setLogoLoadFailed(true);
  };
  
  const getSchoolInitials = (name: string) => {
    return name
      .split(' ')
      .map(word => word[0])
      .join('')
      .toUpperCase()
      .slice(0, 3);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md" data-testid="contact-school-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Contact My School
          </DialogTitle>
          <DialogDescription>
            Get in touch with your school administration for questions or assistance.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {isLoading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            </div>
          )}

          {error && (
            <Alert variant="destructive">
              <AlertDescription>
                Failed to load school contact information. Please try again later.
              </AlertDescription>
            </Alert>
          )}

          {!isLoading && !error && !school && (
            <Alert>
              <AlertDescription>
                No school is currently associated with your account. Please contact support for assistance.
              </AlertDescription>
            </Alert>
          )}

          {school && (
            <div className="space-y-4">
              <div className="rounded-lg bg-gray-50 p-4">
                {/* School Logo */}
                <div className="flex justify-center mb-4">
                  {school.logo && !logoLoadFailed ? (
                    <img 
                      src={school.logo} 
                      alt={school.name}
                      className="h-20 w-auto max-w-[200px] object-contain"
                      onError={handleLogoError}
                      data-testid="school-logo"
                    />
                  ) : (
                    <div className="flex flex-col items-center gap-2">
                      <div className="h-20 w-20 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center">
                        <span className="text-white text-2xl font-bold">
                          {getSchoolInitials(school.name)}
                        </span>
                      </div>
                      <p className="text-sm font-semibold text-gray-700" data-testid="school-name">
                        {school.name}
                      </p>
                    </div>
                  )}
                </div>

                <div className="space-y-3">
                  {school.email && (
                    <div className="flex items-start gap-3">
                      <Mail className="h-4 w-4 text-gray-500 mt-0.5 flex-shrink-0" />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-700">Email</p>
                        <a
                          href={`mailto:${school.email}`}
                          className="text-sm text-blue-600 hover:underline"
                          data-testid="school-email"
                        >
                          {school.email}
                        </a>
                      </div>
                    </div>
                  )}

                  {school.phoneNumber && (
                    <div className="flex items-start gap-3">
                      <Phone className="h-4 w-4 text-gray-500 mt-0.5 flex-shrink-0" />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-700">Phone</p>
                        <a
                          href={`tel:${school.phoneNumber}`}
                          className="text-sm text-blue-600 hover:underline"
                          data-testid="school-phone"
                        >
                          {school.phoneNumber}
                        </a>
                      </div>
                    </div>
                  )}

                  {school.website && (
                    <div className="flex items-start gap-3">
                      <Globe className="h-4 w-4 text-gray-500 mt-0.5 flex-shrink-0" />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-700">Website</p>
                        <a
                          href={school.website.startsWith('http') ? school.website : `https://${school.website}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-blue-600 hover:underline"
                          data-testid="school-website"
                        >
                          {school.website}
                        </a>
                      </div>
                    </div>
                  )}

                  {hasAddress && (
                    <div className="flex items-start gap-3">
                      <MapPin className="h-4 w-4 text-gray-500 mt-0.5 flex-shrink-0" />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-700">Address</p>
                        <p className="text-sm text-gray-600" data-testid="school-address">
                          {school.address}
                          <br />
                          {school.city}, {school.state} {school.zipCode}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <p className="text-xs text-gray-500 text-center">
                For technical issues with the platform, please use the AI Support Assistant.
              </p>
            </div>
          )}
        </div>

        <div className="flex justify-end">
          <Button onClick={onClose} data-testid="close-contact-dialog">
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
