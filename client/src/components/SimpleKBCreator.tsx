import React, { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface KBData {
  title: string;
  description: string;
  subject: string;
  difficulty: string;
  isPublic: boolean;
  price: number;
  files: any[];
  metadata: {
    tags: string[];
    objectives: string[];
  };
}

export function SimpleKBCreator() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [subject, setSubject] = useState("Other");

  const createKBMutation = useMutation({
    mutationFn: async (kbData: KBData) => {
      const response = await fetch("/api/knowledge-bases", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(kbData),
      });
      
      if (!response.ok) {
        throw new Error("Failed to create knowledge base");
      }
      
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/schools/knowledge-bases"] });
      toast({
        title: "Success",
        description: "Knowledge base created successfully",
      });
      setTitle("");
      setDescription("");
      setSubject("Other");
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create knowledge base",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!title.trim() || !description.trim()) {
      toast({
        title: "Error",
        description: "Title and description are required",
        variant: "destructive",
      });
      return;
    }

    const kbData: KBData = {
      title: title.trim(),
      description: description.trim(),
      subject,
      difficulty: "All Levels",
      isPublic: true,
      price: 0,
      files: [],
      metadata: {
        tags: ["created-via-form"],
        objectives: ["Educational content"],
      },
    };

    createKBMutation.mutate(kbData);
  };

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Create Knowledge Base</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="title" className="block text-sm font-medium mb-1">
              Title
            </label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter knowledge base title"
              required
            />
          </div>
          
          <div>
            <label htmlFor="description" className="block text-sm font-medium mb-1">
              Description
            </label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Enter description"
              required
            />
          </div>
          
          <div>
            <label htmlFor="subject" className="block text-sm font-medium mb-1">
              Subject
            </label>
            <select
              id="subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full p-2 border rounded"
            >
              <option value="History">History</option>
              <option value="Science">Science</option>
              <option value="Math">Math</option>
              <option value="Language Arts">Language Arts</option>
              <option value="Other">Other</option>
            </select>
          </div>
          
          <Button 
            type="submit" 
            className="w-full"
            disabled={createKBMutation.isPending}
          >
            {createKBMutation.isPending ? "Creating..." : "Create Knowledge Base"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}