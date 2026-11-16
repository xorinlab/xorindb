import { describe, it, expect, beforeEach } from 'vitest';
import { createDatabase, Database } from '../src';

interface SensorReading {
  sensorId: string;
  temperature: number;
  humidity: number;
  active: boolean;
  status: string;
  location: {
    zone: string;
    altitude: number;
  };
}

describe('Chained Comparison Methods (.eq, .ne, .gt, .gte, .lt, .lte)', () => {
  let db: Database;

  beforeEach(async () => {
    db = await createDatabase({ name: `test-comparison-db-${Date.now()}` });
  });

  it('should evaluate equality with .eq() and .equals()', async () => {
    const sensors = await db.collection<SensorReading>({ name: 'sensors' });

    await sensors.insert({
      sensorId: 'S1',
      temperature: 22.5,
      humidity: 45,
      active: true,
      status: 'nominal',
      location: { zone: 'North', altitude: 100 }
    });

    await sensors.insert({
      sensorId: 'S2',
      temperature: 35.0,
      humidity: 60,
      active: false,
      status: 'warning',
      location: { zone: 'South', altitude: 250 }
    });

    const activeSensors = await sensors.find().where('active').eq(true).exec();
    expect(activeSensors.length).toBe(1);
    expect(activeSensors[0].sensorId).toBe('S1');

    const nominalSensors = await sensors.find().where('status').equals('nominal').exec();
    expect(nominalSensors.length).toBe(1);
    expect(nominalSensors[0].sensorId).toBe('S1');
  });

  it('should evaluate inequality with .ne()', async () => {
    const sensors = await db.collection<SensorReading>({ name: 'sensors' });

    await sensors.insert({
      sensorId: 'A',
      temperature: 15,
      humidity: 40,
      active: true,
      status: 'nominal',
      location: { zone: 'East', altitude: 50 }
    });

    await sensors.insert({
      sensorId: 'B',
      temperature: 20,
      humidity: 50,
      active: true,
      status: 'offline',
      location: { zone: 'West', altitude: 80 }
    });

    const onlineSensors = await sensors.find().where('status').ne('offline').exec();
    expect(onlineSensors.length).toBe(1);
    expect(onlineSensors[0].sensorId).toBe('A');
  });

  it('should evaluate range boundaries using .gt(), .gte(), .lt(), and .lte()', async () => {
    const sensors = await db.collection<SensorReading>({ name: 'sensors' });

    await sensors.insert({
      sensorId: 'T10',
      temperature: 10,
      humidity: 30,
      active: true,
      status: 'ok',
      location: { zone: 'Z1', altitude: 10 }
    });

    await sensors.insert({
      sensorId: 'T20',
      temperature: 20,
      humidity: 50,
      active: true,
      status: 'ok',
      location: { zone: 'Z2', altitude: 20 }
    });

    await sensors.insert({
      sensorId: 'T30',
      temperature: 30,
      humidity: 70,
      active: true,
      status: 'ok',
      location: { zone: 'Z3', altitude: 30 }
    });

    // Strict greater than
    const gt20 = await sensors.find().where('temperature').gt(20).exec();
    expect(gt20.length).toBe(1);
    expect(gt20[0].sensorId).toBe('T30');

    // Greater than or equal to
    const gte20 = await sensors.find().where('temperature').gte(20).exec();
    expect(gte20.length).toBe(2);
    expect(gte20.map(s => s.sensorId).sort()).toEqual(['T20', 'T30']);

    // Strict less than
    const lt20 = await sensors.find().where('temperature').lt(20).exec();
    expect(lt20.length).toBe(1);
    expect(lt20[0].sensorId).toBe('T10');

    // Less than or equal to
    const lte20 = await sensors.find().where('temperature').lte(20).exec();
    expect(lte20.length).toBe(2);
    expect(lte20.map(s => s.sensorId).sort()).toEqual(['T10', 'T20']);
  });

  it('should chain multiple comparison operators on the same field to form closed intervals', async () => {
    const sensors = await db.collection<SensorReading>({ name: 'sensors' });

    await sensors.insert({
      sensorId: 'R1',
      temperature: 18,
      humidity: 45,
      active: true,
      status: 'ok',
      location: { zone: 'Z', altitude: 0 }
    });

    await sensors.insert({
      sensorId: 'R2',
      temperature: 25,
      humidity: 55,
      active: true,
      status: 'ok',
      location: { zone: 'Z', altitude: 0 }
    });

    await sensors.insert({
      sensorId: 'R3',
      temperature: 32,
      humidity: 65,
      active: true,
      status: 'ok',
      location: { zone: 'Z', altitude: 0 }
    });

    // 20 <= temperature <= 30
    const comfortable = await sensors.find()
      .where('temperature').gte(20).lte(30)
      .exec();

    expect(comfortable.length).toBe(1);
    expect(comfortable[0].sensorId).toBe('R2');
  });

  it('should support comparison chaining on nested dot-notation paths', async () => {
    const sensors = await db.collection<SensorReading>({ name: 'sensors' });

    await sensors.insert({
      sensorId: 'H1',
      temperature: 20,
      humidity: 50,
      active: true,
      status: 'ok',
      location: { zone: 'Highlands', altitude: 1200 }
    });

    await sensors.insert({
      sensorId: 'L1',
      temperature: 24,
      humidity: 50,
      active: true,
      status: 'ok',
      location: { zone: 'Lowlands', altitude: 300 }
    });

    const highAltitudeSensors = await sensors.find()
      .where('location.altitude').gte(1000)
      .exec();

    expect(highAltitudeSensors.length).toBe(1);
    expect(highAltitudeSensors[0].sensorId).toBe('H1');
  });
});
