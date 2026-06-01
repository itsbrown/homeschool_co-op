import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import {
  ensureParentRegistrationLocation,
  persistParentLocationAssociation,
  rollbackRegistrationAfterLocationFailure,
  type ParentLocationStorage,
} from '../../lib/persist-parent-location';

jest.mock('../../db', () => ({
  getDb: jest.fn(async () => ({
    delete: jest.fn(() => ({
      where: jest.fn(async () => undefined),
    })),
  })),
}));

function makeStorage(overrides: Partial<ParentLocationStorage> = {}): ParentLocationStorage {
  return {
    getSchool: jest.fn(async (id: number) => ({ id, name: 'Test School' })) as ParentLocationStorage['getSchool'],
    getLocationsBySchoolId: jest.fn(async () => [
      { id: 10, schoolId: 1, name: 'Brighton', code: 'BRIG', isActive: true },
      { id: 11, schoolId: 1, name: 'Greece', code: 'GREC', isActive: true },
    ]) as ParentLocationStorage['getLocationsBySchoolId'],
    getUserLocationsByUserId: jest.fn(async () => []) as ParentLocationStorage['getUserLocationsByUserId'],
    createUserLocation: jest.fn(async (row) => ({
      id: 99,
      ...row,
      createdAt: new Date(),
      updatedAt: new Date(),
    })) as ParentLocationStorage['createUserLocation'],
    updateUser: jest.fn(async () => ({})) as ParentLocationStorage['updateUser'],
    ...overrides,
  };
}

describe('persistParentLocationAssociation', () => {
  it('creates user_locations then sets users.location_id', async () => {
    const storage = makeStorage();
    const order: string[] = [];
    (storage.createUserLocation as jest.Mock).mockImplementation(async () => {
      order.push('createUserLocation');
      return { id: 1, userId: 5, locationId: 10, isActive: true };
    });
    (storage.updateUser as jest.Mock).mockImplementation(async () => {
      order.push('updateUser');
    });

    await persistParentLocationAssociation(storage, 5, 10);

    expect(storage.createUserLocation).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 5,
        locationId: 10,
        isActive: true,
        accessLevel: 'view',
      }),
    );
    expect(storage.updateUser).toHaveBeenCalledWith(5, { locationId: 10 });
    expect(order).toEqual(['createUserLocation', 'updateUser']);
  });

  it('skips createUserLocation when an active row already exists for that campus', async () => {
    const storage = makeStorage({
      getUserLocationsByUserId: jest.fn(async () => [
        { id: 1, userId: 5, locationId: 10, isActive: true },
      ]) as ParentLocationStorage['getUserLocationsByUserId'],
    });

    await persistParentLocationAssociation(storage, 5, 10);

    expect(storage.createUserLocation).not.toHaveBeenCalled();
    expect(storage.updateUser).toHaveBeenCalledWith(5, { locationId: 10 });
  });

  it('creates user_locations when existing row is inactive', async () => {
    const storage = makeStorage({
      getUserLocationsByUserId: jest.fn(async () => [
        { id: 1, userId: 5, locationId: 10, isActive: false },
      ]) as ParentLocationStorage['getUserLocationsByUserId'],
    });

    await persistParentLocationAssociation(storage, 5, 10);

    expect(storage.createUserLocation).toHaveBeenCalled();
    expect(storage.updateUser).toHaveBeenCalledWith(5, { locationId: 10 });
  });
});

describe('ensureParentRegistrationLocation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns ok without persist when schoolId is null', async () => {
    const storage = makeStorage();
    const result = await ensureParentRegistrationLocation(storage, {
      userId: 1,
      schoolId: null,
      preferredLocationId: 10,
      isSchoolCodeParentSignup: true,
    });
    expect(result).toEqual({ ok: true, locationId: null });
    expect(storage.createUserLocation).not.toHaveBeenCalled();
  });

  it('requires campus for school-code signup when school has locations', async () => {
    const storage = makeStorage();
    const result = await ensureParentRegistrationLocation(storage, {
      userId: 1,
      schoolId: 1,
      preferredLocationId: null,
      isSchoolCodeParentSignup: true,
    });
    expect(result).toEqual({
      ok: false,
      message: 'Please select a campus location to finish registration.',
      status: 400,
    });
    expect(storage.createUserLocation).not.toHaveBeenCalled();
  });

  it('rejects campus id that does not belong to the school', async () => {
    const storage = makeStorage();
    const result = await ensureParentRegistrationLocation(storage, {
      userId: 1,
      schoolId: 1,
      preferredLocationId: 999,
      isSchoolCodeParentSignup: true,
    });
    expect(result).toEqual({
      ok: false,
      message: 'The selected campus is not valid for this school.',
      status: 400,
    });
    expect(storage.createUserLocation).not.toHaveBeenCalled();
  });

  it('persists both user_locations and users.location_id on success', async () => {
    const storage = makeStorage();
    const result = await ensureParentRegistrationLocation(storage, {
      userId: 42,
      schoolId: 1,
      preferredLocationId: 11,
      isSchoolCodeParentSignup: true,
    });
    expect(result).toEqual({ ok: true, locationId: 11 });
    expect(storage.createUserLocation).toHaveBeenCalled();
    expect(storage.updateUser).toHaveBeenCalledWith(42, { locationId: 11 });
  });

  it('returns 500 when persist throws', async () => {
    const storage = makeStorage({
      createUserLocation: jest.fn(async () => {
        throw new Error('connection reset');
      }) as ParentLocationStorage['createUserLocation'],
    });
    const result = await ensureParentRegistrationLocation(storage, {
      userId: 1,
      schoolId: 1,
      preferredLocationId: 10,
      isSchoolCodeParentSignup: true,
    });
    expect(result).toEqual({
      ok: false,
      message: 'Could not save your campus location. Please try again.',
      status: 500,
    });
  });

  it('returns 500 when updateUser throws during persist', async () => {
    const storage = makeStorage({
      updateUser: jest.fn(async () => {
        throw new Error('write failed');
      }) as ParentLocationStorage['updateUser'],
    });
    const result = await ensureParentRegistrationLocation(storage, {
      userId: 1,
      schoolId: 1,
      preferredLocationId: 10,
      isSchoolCodeParentSignup: true,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(500);
    expect(result.message).toMatch(/campus location/i);
  });

  it('allows non-school-code signup without preferred campus when school has locations', async () => {
    const storage = makeStorage();
    const result = await ensureParentRegistrationLocation(storage, {
      userId: 1,
      schoolId: 1,
      preferredLocationId: null,
      isSchoolCodeParentSignup: false,
    });
    expect(result).toEqual({ ok: true, locationId: 10 });
    expect(storage.createUserLocation).toHaveBeenCalled();
    expect(storage.updateUser).toHaveBeenCalledWith(1, { locationId: 10 });
  });

  it('rollbackRegistrationAfterLocationFailure deletes user_locations, roles, and user', async () => {
    const deleteUserRolesByUserId = jest.fn(async () => undefined);
    const deleteUser = jest.fn(async () => undefined);
    await rollbackRegistrationAfterLocationFailure(
      { deleteUserRolesByUserId, deleteUser },
      77,
    );
    expect(deleteUserRolesByUserId).toHaveBeenCalledWith(77);
    expect(deleteUser).toHaveBeenCalledWith(77);
  });

  it('returns ok with null locationId when school has no campuses', async () => {
    const storage = makeStorage({
      getLocationsBySchoolId: jest.fn(async () => []) as ParentLocationStorage['getLocationsBySchoolId'],
    });
    const result = await ensureParentRegistrationLocation(storage, {
      userId: 1,
      schoolId: 1,
      preferredLocationId: null,
      isSchoolCodeParentSignup: true,
    });
    expect(result).toEqual({ ok: true, locationId: null });
    expect(storage.createUserLocation).not.toHaveBeenCalled();
  });
});
