import { Request, Response } from "express";
import { storage } from "../storage";
import { insertEmergencyContactSchema } from "@shared/schema";
import { ZodError } from "zod";
import { formatZodError } from "../utils";

// Get all emergency contacts for the authenticated user
export const getMyEmergencyContacts = async (req: Request, res: Response) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    const contacts = await storage.getEmergencyContactsByUserId(req.session.userId);
    res.json(contacts);
  } catch (error: any) {
    console.error("Error fetching emergency contacts:", error);
    res.status(500).json({ message: "Error fetching emergency contacts", error: error.message });
  }
};

// Get a specific emergency contact by ID (only if user owns the contact)
export const getEmergencyContactById = async (req: Request, res: Response) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    const contactId = parseInt(req.params.id);
    if (isNaN(contactId)) {
      return res.status(400).json({ message: "Invalid emergency contact ID" });
    }

    const contact = await storage.getEmergencyContactById(contactId);
    
    if (!contact) {
      return res.status(404).json({ message: "Emergency contact not found" });
    }
    
    // Security check - only allow user to access their own emergency contacts
    if (contact.userId !== req.session.userId) {
      return res.status(403).json({ message: "Not authorized to access this emergency contact" });
    }

    res.json(contact);
  } catch (error: any) {
    console.error("Error fetching emergency contact:", error);
    res.status(500).json({ message: "Error fetching emergency contact", error: error.message });
  }
};

// Create a new emergency contact for the authenticated user
export const createEmergencyContact = async (req: Request, res: Response) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    const validatedData = insertEmergencyContactSchema.parse(req.body);
    
    const contact = await storage.createEmergencyContact({
      ...validatedData,
      userId: req.session.userId
    });

    res.status(201).json(contact);
  } catch (error: any) {
    if (error instanceof ZodError) {
      return res.status(400).json({ 
        message: "Invalid emergency contact data", 
        errors: formatZodError(error)
      });
    }
    
    console.error("Error creating emergency contact:", error);
    res.status(500).json({ message: "Error creating emergency contact", error: error.message });
  }
};

// Update an existing emergency contact (only if user owns the contact)
export const updateEmergencyContact = async (req: Request, res: Response) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    const contactId = parseInt(req.params.id);
    if (isNaN(contactId)) {
      return res.status(400).json({ message: "Invalid emergency contact ID" });
    }

    // First check if contact exists and belongs to user
    const existingContact = await storage.getEmergencyContactById(contactId);
    if (!existingContact) {
      return res.status(404).json({ message: "Emergency contact not found" });
    }
    
    // Security check - only allow user to update their own emergency contacts
    if (existingContact.userId !== req.session.userId) {
      return res.status(403).json({ message: "Not authorized to update this emergency contact" });
    }

    const validatedData = insertEmergencyContactSchema.partial().parse(req.body);
    
    const updatedContact = await storage.updateEmergencyContact(contactId, validatedData);
    res.json(updatedContact);
  } catch (error: any) {
    if (error instanceof ZodError) {
      return res.status(400).json({ 
        message: "Invalid emergency contact data", 
        errors: formatZodError(error)
      });
    }
    
    console.error("Error updating emergency contact:", error);
    res.status(500).json({ message: "Error updating emergency contact", error: error.message });
  }
};

// Delete an emergency contact (only if user owns the contact)
export const deleteEmergencyContact = async (req: Request, res: Response) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    const contactId = parseInt(req.params.id);
    if (isNaN(contactId)) {
      return res.status(400).json({ message: "Invalid emergency contact ID" });
    }

    // First check if contact exists and belongs to user
    const existingContact = await storage.getEmergencyContactById(contactId);
    if (!existingContact) {
      return res.status(404).json({ message: "Emergency contact not found" });
    }
    
    // Security check - only allow user to delete their own emergency contacts
    if (existingContact.userId !== req.session.userId) {
      return res.status(403).json({ message: "Not authorized to delete this emergency contact" });
    }

    await storage.deleteEmergencyContact(contactId);
    res.status(204).send();
  } catch (error: any) {
    console.error("Error deleting emergency contact:", error);
    res.status(500).json({ message: "Error deleting emergency contact", error: error.message });
  }
};