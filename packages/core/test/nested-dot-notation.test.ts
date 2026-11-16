import { describe, it, expect, beforeEach } from 'vitest';
import { createDatabase, Database } from '../src';

interface Employee {
  name: string;
  department: {
    title: string;
    code: string;
    location: {
      city: string;
      building: number;
    };
  };
  metrics?: {
    score: number;
  };
}

describe('Nested Object Dot-Notation Queries', () => {
  let db: Database;

  beforeEach(async () => {
    db = await createDatabase({ name: `test-nested-db-${Date.now()}` });
  });

  it('should query documents using single-level dot-notation', async () => {
    const employees = await db.collection<Employee>({ name: 'employees' });

    await employees.insert({
      name: 'Alice',
      department: {
        title: 'Engineering',
        code: 'ENG',
        location: { city: 'San Francisco', building: 1 }
      }
    });

    await employees.insert({
      name: 'Bob',
      department: {
        title: 'Design',
        code: 'DES',
        location: { city: 'New York', building: 2 }
      }
    });

    const engStaff = await employees.find({
      'department.code': 'ENG'
    }).exec();

    expect(engStaff.length).toBe(1);
    expect(engStaff[0].name).toBe('Alice');
  });

  it('should query deeply nested objects via multi-level dot-notation', async () => {
    const employees = await db.collection<Employee>({ name: 'employees' });

    await employees.insert({
      name: 'Charlie',
      department: {
        title: 'Sales',
        code: 'SAL',
        location: { city: 'Tokyo', building: 10 }
      }
    });

    await employees.insert({
      name: 'Dave',
      department: {
        title: 'Sales',
        code: 'SAL',
        location: { city: 'London', building: 4 }
      }
    });

    const tokyoStaff = await employees.find({
      'department.location.city': 'Tokyo'
    }).exec();

    expect(tokyoStaff.length).toBe(1);
    expect(tokyoStaff[0].name).toBe('Charlie');

    const highBuildingStaff = await employees.find({
      'department.location.building': { $gt: 5 }
    }).exec();

    expect(highBuildingStaff.length).toBe(1);
    expect(highBuildingStaff[0].name).toBe('Charlie');
  });

  it('should combine dot-notation with logical operators and sorting', async () => {
    const employees = await db.collection<Employee>({ name: 'employees' });

    await employees.insert({
      name: 'Eve',
      department: {
        title: 'AI Lab',
        code: 'AI',
        location: { city: 'Boston', building: 5 }
      },
      metrics: { score: 95 }
    });

    await employees.insert({
      name: 'Frank',
      department: {
        title: 'AI Lab',
        code: 'AI',
        location: { city: 'Austin', building: 3 }
      },
      metrics: { score: 80 }
    });

    const highScorers = await employees.find({
      $and: [
        { 'department.code': 'AI' },
        { 'metrics.score': { $gte: 90 } }
      ]
    }).exec();

    expect(highScorers.length).toBe(1);
    expect(highScorers[0].name).toBe('Eve');

    // Sorting by nested dot-notation property
    const sortedByBuilding = await employees.find(
      { 'department.code': 'AI' },
      { sort: { 'department.location.building': 'asc' } }
    ).exec();

    expect(sortedByBuilding.length).toBe(2);
    expect(sortedByBuilding[0].name).toBe('Frank'); // building 3
    expect(sortedByBuilding[1].name).toBe('Eve');   // building 5
  });

  it('should safely handle missing or nullish nested properties', async () => {
    const employees = await db.collection<Employee>({ name: 'employees' });

    await employees.insert({
      name: 'Grace',
      department: {
        title: 'Marketing',
        code: 'MKT',
        location: { city: 'Berlin', building: 1 }
      }
      // metrics is undefined
    });

    const withMetrics = await employees.find({
      'metrics.score': { $gt: 50 }
    }).exec();

    expect(withMetrics.length).toBe(0);
  });
});
