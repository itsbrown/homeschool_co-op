import { describe, expect, it, jest } from '@jest/globals';
import {
  deleteSchoolAdminChild,
  DeleteSchoolAdminChildError,
} from '../lib/delete-school-admin-child';

describe('deleteSchoolAdminChild', () => {
  const child = {
    id: 250,
    firstName: 'Gabriel',
    lastName: 'Hamilton',
    parentId: 130,
  } as any;

  it('deletes school_students before the child row', async () => {
    const order: string[] = [];
    const getSchoolStudentByChildId = jest
      .fn<() => Promise<{ id: number; childId: number } | undefined>>()
      .mockResolvedValueOnce({ id: 215, childId: 250 })
      .mockResolvedValueOnce(undefined);

    const storage = {
      getChildById: jest.fn(async () => child),
      getEnrollmentsByChildId: jest.fn(async () => []),
      getSchoolStudentByChildId,
      deleteSchoolStudent: jest.fn(async (id: number) => {
        order.push(`schoolStudent:${id}`);
      }),
      deleteChild: jest.fn(async (id: number) => {
        order.push(`child:${id}`);
      }),
    };

    const result = await deleteSchoolAdminChild(storage as any, 250);

    expect(result.child.id).toBe(250);
    expect(result.deletedSchoolStudentIds).toEqual([215]);
    expect(order).toEqual(['schoolStudent:215', 'child:250']);
  });

  it('blocks when program enrollments exist', async () => {
    const storage = {
      getChildById: jest.fn(async () => child),
      getEnrollmentsByChildId: jest.fn(async () => [{ id: 1, status: 'enrolled' }]),
      getSchoolStudentByChildId: jest.fn(),
      deleteSchoolStudent: jest.fn(),
      deleteChild: jest.fn(),
    };

    await expect(deleteSchoolAdminChild(storage as any, 250)).rejects.toMatchObject({
      name: 'DeleteSchoolAdminChildError',
      status: 400,
      enrollmentCount: 1,
    });
    expect(storage.deleteChild).not.toHaveBeenCalled();
    expect(storage.deleteSchoolStudent).not.toHaveBeenCalled();
  });

  it('returns 404 when child is missing', async () => {
    const storage = {
      getChildById: jest.fn(async () => undefined),
      getEnrollmentsByChildId: jest.fn(),
      getSchoolStudentByChildId: jest.fn(),
      deleteSchoolStudent: jest.fn(),
      deleteChild: jest.fn(),
    };

    await expect(deleteSchoolAdminChild(storage as any, 999)).rejects.toBeInstanceOf(
      DeleteSchoolAdminChildError,
    );
  });
});
