import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { UploadCloud, AlertCircle, Check } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";

type UploadStatus = "idle" | "uploading" | "success" | "error";

interface CsvUploadFormProps {
  endpoint: string;
  title: string;
  description: string;
  acceptedFileTypes?: string;
  successMessage?: string;
  errorMessage?: string;
  onUploadComplete?: () => void;
  queryKeysToInvalidate?: string[];
}

export function CsvUploadForm({
  endpoint,
  title,
  description,
  acceptedFileTypes = ".csv",
  successMessage = "Upload completed successfully",
  errorMessage = "Failed to upload file",
  onUploadComplete,
  queryKeysToInvalidate = [],
}: CsvUploadFormProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>("idle");
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [uploadResult, setUploadResult] = useState<string>("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setSelectedFile(file);
    setUploadStatus("idle");
    setUploadResult("");
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      toast({
        title: "No file selected",
        description: "Please select a file to upload",
        variant: "destructive",
      });
      return;
    }

    setUploadStatus("uploading");
    setUploadProgress(0);

    // Create a simulated progress indicator
    const progressInterval = setInterval(() => {
      setUploadProgress((prev) => {
        if (prev >= 95) {
          clearInterval(progressInterval);
          return 95;
        }
        return prev + 5;
      });
    }, 100);

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);

      const response = await apiRequest("POST", endpoint, formData, {
        rawFormData: true,
      });

      clearInterval(progressInterval);
      setUploadProgress(100);

      const result = await response.json();

      if (response.ok) {
        setUploadStatus("success");
        setUploadResult(
          typeof result.message === "string"
            ? result.message
            : `Successfully processed ${result.processedCount || 0} items.`
        );
        
        toast({
          title: "Success",
          description: successMessage,
        });

        // Invalidate the relevant queries to refresh the data
        if (queryKeysToInvalidate.length > 0) {
          queryKeysToInvalidate.forEach(key => {
            queryClient.invalidateQueries({ queryKey: [key] });
          });
        }

        if (onUploadComplete) {
          onUploadComplete();
        }
      } else {
        setUploadStatus("error");
        setUploadResult(result.message || errorMessage);
        toast({
          title: "Error",
          description: result.message || errorMessage,
          variant: "destructive",
        });
      }
    } catch (error) {
      clearInterval(progressInterval);
      setUploadProgress(100);
      setUploadStatus("error");
      setUploadResult(errorMessage);
      toast({
        title: "Error",
        description: "Failed to upload the file",
        variant: "destructive",
      });
    }
  };

  const resetForm = () => {
    setSelectedFile(null);
    setUploadStatus("idle");
    setUploadProgress(0);
    setUploadResult("");
    
    // Reset the file input
    const fileInput = document.getElementById("csvFileInput") as HTMLInputElement;
    if (fileInput) {
      fileInput.value = "";
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="flex flex-col space-y-3">
          <label 
            htmlFor="csvFileInput" 
            className="border-2 border-dashed border-muted-foreground/20 rounded-lg p-8 cursor-pointer text-center hover:bg-muted/50 transition-colors"
          >
            <div className="flex flex-col items-center justify-center gap-2">
              <UploadCloud className="h-10 w-10 text-muted-foreground" />
              <p className="font-medium text-primary">Click to select or drag and drop</p>
              <p className="text-sm text-muted-foreground">
                Upload a CSV file {acceptedFileTypes && `(${acceptedFileTypes})`}
              </p>
              {selectedFile && (
                <div className="flex items-center justify-center mt-2 p-2 bg-primary/10 rounded-md">
                  <p className="text-sm font-medium">{selectedFile.name}</p>
                </div>
              )}
            </div>
            <Input
              id="csvFileInput"
              type="file"
              accept={acceptedFileTypes}
              className="hidden"
              onChange={handleFileChange}
            />
          </label>
        </div>

        {uploadStatus === "uploading" && (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">Uploading...</p>
            <Progress value={uploadProgress} className="h-2" />
          </div>
        )}

        {uploadStatus === "success" && (
          <Alert variant="default" className="bg-green-50 border-green-200">
            <Check className="h-4 w-4 text-green-600" />
            <AlertTitle className="text-green-600">Success</AlertTitle>
            <AlertDescription className="text-green-600">
              {uploadResult || successMessage}
            </AlertDescription>
          </Alert>
        )}

        {uploadStatus === "error" && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>
              {uploadResult || errorMessage}
            </AlertDescription>
          </Alert>
        )}
      </CardContent>

      <CardFooter className="flex justify-between">
        <Button variant="outline" onClick={resetForm}>
          Reset
        </Button>
        <Button 
          onClick={handleUpload} 
          disabled={!selectedFile || uploadStatus === "uploading"}
        >
          {uploadStatus === "uploading" ? "Uploading..." : "Upload"}
        </Button>
      </CardFooter>
    </Card>
  );
}