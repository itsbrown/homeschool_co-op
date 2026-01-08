import { getDb } from '../db';
import { users, schoolStudents, children, auditLogs, locations } from '../../shared/schema';
import { eq, and, inArray } from 'drizzle-orm';
import type { InsertAuditLog } from '../../shared/schema';

export interface LocationSyncResult {
  success: boolean;
  parentUpdated: boolean;
  childrenUpdated: number;
  error?: string;
}

export interface LocationSyncContext {
  actorId: number;
  actorEmail: string;
  actorRole: string;
  schoolId: number;
  ipAddress?: string;
  userAgent?: string;
}

async function createAuditLogDirect(db: any, log: InsertAuditLog) {
  const result = await db.insert(auditLogs).values(log).returning();
  return result[0];
}

export async function validateLocationBelongsToSchool(
  locationId: number,
  schoolId: number
): Promise<boolean> {
  const db = await getDb();
  const location = await db
    .select()
    .from(locations)
    .where(and(eq(locations.id, locationId), eq(locations.schoolId, schoolId)))
    .limit(1);
  return location.length > 0;
}

export async function getParentChildIds(parentId: number, schoolId: number): Promise<number[]> {
  const db = await getDb();
  
  const parentChildren = await db
    .select({ childId: children.id })
    .from(children)
    .where(eq(children.parentId, parentId));
  
  return parentChildren.map((c: { childId: number }) => c.childId);
}

export async function updateParentLocation(
  parentId: number,
  newLocationId: number | null,
  context: LocationSyncContext
): Promise<LocationSyncResult> {
  const db = await getDb();
  
  try {
    if (newLocationId !== null) {
      const isValid = await validateLocationBelongsToSchool(newLocationId, context.schoolId);
      if (!isValid) {
        return {
          success: false,
          parentUpdated: false,
          childrenUpdated: 0,
          error: 'Location does not belong to this school'
        };
      }
    }
    
    const existingUser = await db
      .select({ id: users.id, locationId: users.locationId, email: users.email })
      .from(users)
      .where(eq(users.id, parentId))
      .limit(1);
    
    if (existingUser.length === 0) {
      return {
        success: false,
        parentUpdated: false,
        childrenUpdated: 0,
        error: 'Parent user not found'
      };
    }
    
    const previousLocationId = existingUser[0].locationId;
    
    await db
      .update(users)
      .set({ 
        locationId: newLocationId,
        updatedAt: new Date()
      })
      .where(eq(users.id, parentId));
    
    const childIds = await getParentChildIds(parentId, context.schoolId);
    let childrenUpdated = 0;
    
    if (childIds.length > 0) {
      // Update children table locationId
      await db
        .update(children)
        .set({ 
          locationId: newLocationId,
          updatedAt: new Date()
        })
        .where(inArray(children.id, childIds));
      
      // Update school_students locationId for this school
      await db
        .update(schoolStudents)
        .set({ 
          locationId: newLocationId,
          updatedAt: new Date()
        })
        .where(
          and(
            inArray(schoolStudents.childId, childIds),
            eq(schoolStudents.schoolId, context.schoolId)
          )
        );
      
      childrenUpdated = childIds.length;
    }
    
    await createAuditLogDirect(db, {
      actionType: 'location_update',
      severity: 'info',
      actorId: context.actorId,
      actorRole: context.actorRole,
      actorEmail: context.actorEmail,
      targetType: 'user_location',
      targetId: String(parentId),
      schoolId: context.schoolId,
      ipAddress: context.ipAddress || null,
      userAgent: context.userAgent || null,
      metadata: {
        action: 'parent_location_update',
        parentId,
        previousLocationId,
        newLocationId,
        childrenSynced: childrenUpdated,
        childIds
      }
    });
    
    return {
      success: true,
      parentUpdated: true,
      childrenUpdated
    };
    
  } catch (error) {
    console.error('Location sync error:', error);
    
    await createAuditLogDirect(db, {
      actionType: 'location_update_failed',
      severity: 'error',
      actorId: context.actorId,
      actorRole: context.actorRole,
      actorEmail: context.actorEmail,
      targetType: 'user_location',
      targetId: String(parentId),
      schoolId: context.schoolId,
      ipAddress: context.ipAddress || null,
      userAgent: context.userAgent || null,
      metadata: {
        action: 'parent_location_update_failed',
        parentId,
        newLocationId,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    });
    
    return {
      success: false,
      parentUpdated: false,
      childrenUpdated: 0,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

export async function syncChildLocationToParent(
  childId: number,
  parentId: number,
  schoolId: number
): Promise<{ success: boolean; locationId: number | null }> {
  const db = await getDb();
  
  try {
    const parent = await db
      .select({ locationId: users.locationId })
      .from(users)
      .where(eq(users.id, parentId))
      .limit(1);
    
    if (parent.length === 0) {
      return { success: false, locationId: null };
    }
    
    const parentLocationId = parent[0].locationId;
    
    await db
      .update(schoolStudents)
      .set({ 
        locationId: parentLocationId,
        updatedAt: new Date()
      })
      .where(
        and(
          eq(schoolStudents.childId, childId),
          eq(schoolStudents.schoolId, schoolId)
        )
      );
    
    return { success: true, locationId: parentLocationId };
  } catch (error) {
    console.error('Child location sync error:', error);
    return { success: false, locationId: null };
  }
}

export async function getLocationsBySchoolId(schoolId: number) {
  const db = await getDb();
  return db
    .select()
    .from(locations)
    .where(eq(locations.schoolId, schoolId));
}

export async function getParentLocationInfo(parentId: number) {
  const db = await getDb();
  
  const parent = await db
    .select({
      id: users.id,
      locationId: users.locationId,
      schoolId: users.schoolId
    })
    .from(users)
    .where(eq(users.id, parentId))
    .limit(1);
  
  if (parent.length === 0) {
    return null;
  }
  
  let locationDetails = null;
  if (parent[0].locationId) {
    const loc = await db
      .select()
      .from(locations)
      .where(eq(locations.id, parent[0].locationId))
      .limit(1);
    if (loc.length > 0) {
      locationDetails = loc[0];
    }
  }
  
  return {
    ...parent[0],
    location: locationDetails
  };
}
