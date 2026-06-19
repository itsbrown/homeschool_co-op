import { Response } from "express";
import { storage } from "../storage";
import { insertEmergencyContactSchema } from "@shared/schema";
import { ZodError } from "zod";
import { formatZodError } from "../utils";
import type { AuthenticatedRequest } from "../middleware/supabase-auth";

function getRequestUserId(req: AuthenticatedRequest): number | null {
  if (typeof req.user?.id === "number") return req.user.id;
  const sessionUserId = (req as AuthenticatedRequest & { session?: { userId?: number } })
    .session?.userId;
  return typeof sessionUserId === "number" ? sessionUserId : null;
}

function unauthorized(res: Response) {
  return res.status(401).json({ message: "Not authenticated" });
}

// Get all emergency contacts for the authenticated user
export const getMyEmergencyContacts = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = getRequestUserId(req);
    if (!userId) {
      return unauthorized(res);
    }

    const contacts = await storage.getEmergencyContactsByUserId(userId);
    res.json(contacts);
  } catch (error: any) {
    console.error("Error fetching emergency contacts:", error);
    res.status(500).json({ message: "Error fetching emergency contacts", error: error.message });
  }
};

// Get a specific emergency contact by ID (only if user owns the contact)
export const getEmergencyContactById = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = getRequestUserId(req);
    if (!userId) {
      return unauthorized(res);
    }

    const contactId = parseInt(req.params.id);
    if (isNaN(contactId)) {
      return res.status(400).json({ message: "Invalid emergency contact ID" });
    }

    const contact = await storage.getEmergencyContactById(contactId);

    if (!contact) {
      return res.status(404).json({ message: "Emergency contact not found" });
    }

    if (contact.userId !== userId) {
      return res.status(403).json({ message: "Not authorized to access this emergency contact" });
    }

    res.json(contact);
  } catch (error: any) {
    console.error("Error fetching emergency contact:", error);
    res.status(500).json({ message: "Error fetching emergency contact", error: error.message });
  }
};

// Create a new emergency contact for the authenticated user
export const createEmergencyContact = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = getRequestUserId(req);
    if (!userId) {
      return unauthorized(res);
    }

    const validatedData = insertEmergencyContactSchema.parse(req.body);
    const email = validatedData.email.trim();

    const contact = await storage.createEmergencyContact({
      ...validatedData,
      email,
      userId,
    });

    res.status(201).json(contact);
  } catch (error: any) {
    if (error instanceof ZodError) {
      return res.status(400).json({
        message: "Invalid emergency contact data",
        errors: formatZodError(error),
      });
    }

    console.error("Error creating emergency contact:", error);
    res.status(500).json({ message: "Error creating emergency contact", error: error.message });
  }
};

// Update an existing emergency contact (only if user owns the contact)
export const updateEmergencyContact = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = getRequestUserId(req);
    if (!userId) {
      return unauthorized(res);
    }

    const contactId = parseInt(req.params.id);
    if (isNaN(contactId)) {
      return res.status(400).json({ message: "Invalid emergency contact ID" });
    }

    const existingContact = await storage.getEmergencyContactById(contactId);
    if (!existingContact) {
      return res.status(404).json({ message: "Emergency contact not found" });
    }

    if (existingContact.userId !== userId) {
      return res.status(403).json({ message: "Not authorized to update this emergency contact" });
    }

    const validatedData = insertEmergencyContactSchema.partial().parse(req.body);
    const updatePayload = { ...validatedData };
    if ("email" in updatePayload && typeof updatePayload.email === "string") {
      updatePayload.email = updatePayload.email.trim();
    }

    const updatedContact = await storage.updateEmergencyContact(contactId, updatePayload);
    res.json(updatedContact);
  } catch (error: any) {
    if (error instanceof ZodError) {
      return res.status(400).json({
        message: "Invalid emergency contact data",
        errors: formatZodError(error),
      });
    }

    console.error("Error updating emergency contact:", error);
    res.status(500).json({ message: "Error updating emergency contact", error: error.message });
  }
};

// Delete an emergency contact (only if user owns the contact)
export const deleteEmergencyContact = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = getRequestUserId(req);
    if (!userId) {
      return unauthorized(res);
    }

    const contactId = parseInt(req.params.id);
    if (isNaN(contactId)) {
      return res.status(400).json({ message: "Invalid emergency contact ID" });
    }

    const existingContact = await storage.getEmergencyContactById(contactId);
    if (!existingContact) {
      return res.status(404).json({ message: "Emergency contact not found" });
    }

    if (existingContact.userId !== userId) {
      return res.status(403).json({ message: "Not authorized to delete this emergency contact" });
    }

    await storage.deleteEmergencyContact(contactId);
    res.status(204).send();
  } catch (error: any) {
    console.error("Error deleting emergency contact:", error);
    res.status(500).json({ message: "Error deleting emergency contact", error: error.message });
  }
};
