import { useQuery } from "@tanstack/react-query";

interface ImageServiceStatusResponse {
  status: 'success' | 'error';
  data: {
    huggingFace: {
      available: boolean;
      status: 'operational' | 'unavailable';
    };
    sageMaker: {
      available: boolean;
      status: 'operational' | 'unavailable';
    };
    preferredService: 'sagemaker' | 'huggingface' | 'none';
    anyServiceAvailable: boolean;
  };
  message?: string;
  error?: string;
}

/**
 * A hook to check if image generation services are available
 * Returns the current status of image services and whether they're available
 */
export function useImageServicesStatus() {
  const { data, error, isLoading, refetch } = useQuery<ImageServiceStatusResponse>({
    queryKey: ['/api/image-services/status'],
    queryFn: () => fetch('/api/image-services/status').then(res => res.json()),
    // Cache for 5 minutes, but refetch in the background after 1 minute
    staleTime: 60 * 1000,
    gcTime: 5 * 60 * 1000,
    retry: 2,
  });

  const isHuggingFaceAvailable = data?.data?.huggingFace?.available ?? false;
  const huggingFaceStatus = data?.data?.huggingFace?.status ?? 'unavailable';
  
  const isSageMakerAvailable = data?.data?.sageMaker?.available ?? false;
  const sageMakerStatus = data?.data?.sageMaker?.status ?? 'unavailable';
  
  const preferredService = data?.data?.preferredService ?? 'none';
  const anyServiceAvailable = data?.data?.anyServiceAvailable ?? false;
  
  // User-friendly error message if there was an error checking status
  const errorMessage = error 
    ? 'There was an error checking image services status'
    : undefined;

  return {
    isHuggingFaceAvailable,
    huggingFaceStatus,
    isSageMakerAvailable,
    sageMakerStatus,
    preferredService,
    anyServiceAvailable,
    errorMessage,
    isLoading,
    refetch
  };
}

export default useImageServicesStatus;