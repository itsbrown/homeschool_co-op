import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";
import { Check } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function CheckoutSuccess() {
  const [location, navigate] = useLocation();
  const { toast } = useToast();
  const [isProcessing, setIsProcessing] = useState(true);
  const [knowledgeBaseId, setKnowledgeBaseId] = useState<number | null>(null);
  
  useEffect(() => {
    // Get the knowledge base ID from URL parameters
    const searchParams = new URLSearchParams(window.location.search);
    const kbId = searchParams.get("kb");
    
    if (!kbId) {
      toast({
        title: "Missing information",
        description: "Knowledge base ID is missing.",
        variant: "destructive",
      });
      navigate("/knowledge-base");
      return;
    }
    
    const knowledgeBaseIdNum = parseInt(kbId);
    setKnowledgeBaseId(knowledgeBaseIdNum);
    
    // Record the purchase in our database
    apiRequest("POST", `/api/knowledge-bases/${knowledgeBaseIdNum}/purchase`, {})
      .then((res) => {
        if (!res.ok) {
          return res.json().then(data => {
            throw new Error(data.message || "Failed to record purchase");
          });
        }
        return res.json();
      })
      .then(() => {
        setIsProcessing(false);
        toast({
          title: "Purchase Successful",
          description: "Your purchase has been completed successfully.",
        });
      })
      .catch((err) => {
        console.error("Purchase recording error:", err);
        toast({
          title: "Purchase processing error",
          description: err.message || "There was an error recording your purchase.",
          variant: "destructive",
        });
        setIsProcessing(false);
      });
  }, [navigate, toast]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="flex justify-center mb-4">
            <div className="rounded-full bg-green-100 p-3">
              <Check className="h-8 w-8 text-green-600" />
            </div>
          </div>
          <CardTitle className="text-center">Payment Successful!</CardTitle>
          <CardDescription className="text-center">
            Your knowledge base purchase has been completed
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center">
          {isProcessing ? (
            <p>Processing your purchase...</p>
          ) : (
            <p>You now have access to all content in this knowledge base.</p>
          )}
        </CardContent>
        <CardFooter className="flex justify-center space-x-4">
          <Button onClick={() => navigate('/knowledge-base')}>
            Browse Knowledge Base
          </Button>
          {knowledgeBaseId && (
            <Button variant="outline" onClick={() => navigate(`/knowledge-base/${knowledgeBaseId}`)}>
              View Purchase
            </Button>
          )}
        </CardFooter>
      </Card>
    </div>
  );
}