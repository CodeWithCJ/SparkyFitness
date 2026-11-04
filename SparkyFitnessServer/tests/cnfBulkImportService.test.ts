import { describe, expect, it, vi, beforeEach } from 'vitest';
import zlib from 'node:zlib';

vi.mock('../db/poolManager.js', () => ({
  getClient: vi.fn(),
  getSystemClient: vi.fn(),
}));

const bulkImport = vi.hoisted(() => ({
  client: undefined as unknown,
  save: vi.fn(),
  finish: vi.fn(async () => {}),
}));
vi.mock('../services/bulkImports.js', () => ({
  beginBulkImport: vi.fn(async () => bulkImport),
  readBulkImport: vi.fn(),
}));

vi.mock('../config/logging.js', () => ({
  log: vi.fn(),
}));

vi.mock('../services/customNutrientService.js', () => ({
  default: {
    getCustomNutrients: vi
      .fn()
      .mockResolvedValue([{ name: 'Zinc', unit: 'mg', aliases: ['Zinc, Zn'] }]),
  },
}));

import { getClient, getSystemClient } from '../db/poolManager.js';
import {
  startCnfImport,
  deleteCnfLibraryFoods,
} from '../services/cnfBulkImportService.js';

async function importCnfFromZipBuffer(
  userId: string,
  zip: Buffer,
  options: Parameters<typeof startCnfImport>[2]
) {
  const started = await startCnfImport(userId, { zip }, options);
  return started!.done;
}

function createMockZip(
  files: Array<{ name: string; content: string }>
): Buffer {
  const localHeaders: Buffer[] = [];
  const centralHeaders: Buffer[] = [];
  let offset = 0;

  for (const file of files) {
    const nameBytes = Buffer.from(file.name, 'utf8');
    const rawContent = Buffer.from(file.content, 'utf8');
    const body = zlib.deflateRawSync(rawContent);

    // Local Header
    const local = Buffer.alloc(30 + nameBytes.length + body.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(8, 8); // Deflate
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(0, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(rawContent.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    local.writeUInt16LE(0, 28);
    nameBytes.copy(local, 30);
    body.copy(local, 30 + nameBytes.length);
    localHeaders.push(local);

    // Central Directory Header
    const cd = Buffer.alloc(46 + nameBytes.length);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(20, 4);
    cd.writeUInt16LE(20, 6);
    cd.writeUInt16LE(0, 8);
    cd.writeUInt16LE(8, 10);
    cd.writeUInt16LE(0, 12);
    cd.writeUInt16LE(0, 14);
    cd.writeUInt32LE(0, 16);
    cd.writeUInt32LE(body.length, 20);
    cd.writeUInt32LE(rawContent.length, 24);
    cd.writeUInt16LE(nameBytes.length, 28);
    cd.writeUInt16LE(0, 30);
    cd.writeUInt16LE(0, 32);
    cd.writeUInt16LE(0, 34);
    cd.writeUInt16LE(0, 36);
    cd.writeUInt32LE(0, 38);
    cd.writeUInt32LE(offset, 42);
    nameBytes.copy(cd, 46);
    centralHeaders.push(cd);

    offset += local.length;
  }

  const cdTotalSize = centralHeaders.reduce((acc, h) => acc + h.length, 0);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(cdTotalSize, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localHeaders, ...centralHeaders, eocd]);
}

describe('cnfBulkImportService', () => {
  const mockQuery = vi.fn();
  const mockClient = {
    query: mockQuery,
    release: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    bulkImport.client = mockClient;
    vi.mocked(getClient).mockResolvedValue(
      mockClient as unknown as import('pg').PoolClient
    );
    vi.mocked(getSystemClient).mockResolvedValue(
      mockClient as unknown as import('pg').PoolClient
    );
  });

  it('imports foods, applies custom nutrients, and creates variants', async () => {
    const zipBuf = createMockZip([
      {
        name: 'FOOD NAME.csv',
        content:
          'FoodID,FoodCode,FoodDescription\n1,571,"Chicken, broiler, giblets, raw"',
      },
      {
        name: 'NUTRIENT AMOUNT.csv',
        content:
          'FoodID,NutrientID,NutrientValue\n1,208,124\n1,203,18.5\n1,204,4.2\n1,205,1.1\n1,309,3.5',
      },
      {
        name: 'NUTRIENT NAME.csv',
        content:
          'NutrientID,NutrientCode,NutrientName\n208,208,Energy (kcal)\n203,203,Protein\n204,204,Fat (total)\n205,205,Carbohydrate\n309,309,Zinc, Zn',
      },
      {
        name: 'CONVERSION FACTOR.csv',
        content: 'FoodID,MeasureID,ConversionFactorValue\n1,10,0.5',
      },
      {
        name: 'MEASURE NAME.csv',
        content: 'MeasureID,MeasureDescription\n10,1/2 cup (50 g)',
      },
    ]);

    // Mock query responses:
    // 1: BEGIN
    // 2: SELECT id FROM foods (not found)
    // 3: INSERT INTO foods -> returns id 'food-123'
    // 4: INSERT INTO food_variants (batched default + measure variants)
    // 5: COMMIT
    mockQuery
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // SELECT existing
      .mockResolvedValueOnce({
        rows: [{ id: 'food-123', provider_external_id: '571' }],
      }) // INSERT foods
      .mockResolvedValueOnce({ rows: [] }) // INSERT food_variants (batched)
      .mockResolvedValueOnce({ rows: [] }); // COMMIT

    const result = await importCnfFromZipBuffer('user-1', zipBuf, {
      syncPastEntries: false,
    });

    expect(result.imported).toBe(1);
    expect(result.updated).toBe(0);
    expect(result.total).toBe(1);

    expect(bulkImport.finish).toHaveBeenCalledWith(
      expect.objectContaining({
        isRunning: false,
        status: 'completed',
        progress: 100,
      })
    );

    // Verify food insert parameters
    const foodInsertCall = mockQuery.mock.calls.find(
      (call) =>
        typeof call[0] === 'string' && call[0].includes('INSERT INTO foods')
    );
    expect(foodInsertCall).toBeDefined();
    if (!foodInsertCall)
      throw new Error('Expected foodInsertCall to be defined');
    expect(foodInsertCall[1][0]).toBe('user-1');
    expect(foodInsertCall[1][1]).toBe('Chicken, broiler, giblets, raw');
    expect(foodInsertCall[1][2]).toBe('571');

    // Verify food variant insert has custom nutrients with Zinc = 3.5
    const variantInsertCall = mockQuery.mock.calls.find(
      (call) =>
        typeof call[0] === 'string' &&
        call[0].includes('INSERT INTO food_variants')
    );
    expect(variantInsertCall).toBeDefined();
    if (!variantInsertCall)
      throw new Error('Expected variantInsertCall to be defined');
    const customNutrientsJson = variantInsertCall[1][24];
    expect(JSON.parse(customNutrientsJson)).toEqual({ Zinc: 3.5 });
  });

  it('writes nothing once the import has lost its lock', async () => {
    const zipBuf = createMockZip([
      {
        name: 'FOOD NAME.csv',
        content: 'FoodID,FoodCode,FoodDescription\n1,571,"Chicken"',
      },
      {
        name: 'NUTRIENT AMOUNT.csv',
        content: 'FoodID,NutrientID,NutrientValue\n1,208,130',
      },
      {
        name: 'NUTRIENT NAME.csv',
        content: 'NutrientID,NutrientCode,NutrientName\n208,208,Energy',
      },
    ]);
    bulkImport.save.mockRejectedValueOnce(new Error('Connection terminated'));

    await expect(
      importCnfFromZipBuffer('user-1', zipBuf, { syncPastEntries: false })
    ).rejects.toThrow('Connection terminated');
    expect(mockQuery).not.toHaveBeenCalled();
    expect(bulkImport.finish).toHaveBeenCalledWith(
      expect.objectContaining({ isRunning: false, status: 'failed' })
    );
  });

  it('keeps the import error when saving the final status also fails', async () => {
    const zipBuf = createMockZip([
      {
        name: 'FOOD NAME.csv',
        content: 'FoodID,FoodCode,FoodDescription\n1,571,"Chicken"',
      },
      {
        name: 'NUTRIENT AMOUNT.csv',
        content: 'FoodID,NutrientID,NutrientValue\n1,208,130',
      },
      {
        name: 'NUTRIENT NAME.csv',
        content: 'NutrientID,NutrientCode,NutrientName\n208,208,Energy',
      },
    ]);
    bulkImport.save.mockRejectedValueOnce(new Error('Connection terminated'));
    bulkImport.finish.mockRejectedValueOnce(new Error('Status save failed'));

    await expect(
      importCnfFromZipBuffer('user-1', zipBuf, { syncPastEntries: false })
    ).rejects.toThrow('Connection terminated');
  });

  it('updates existing foods, recalculates meal_foods and food_entries when syncPastEntries is true', async () => {
    const zipBuf = createMockZip([
      {
        name: 'FOOD NAME.csv',
        content: 'FoodID,FoodCode,FoodDescription\n1,571,"Updated Chicken"',
      },
      {
        name: 'NUTRIENT AMOUNT.csv',
        content:
          'FoodID,NutrientID,NutrientValue\n1,208,130\n1,203,19\n1,204,4\n1,205,1',
      },
      {
        name: 'NUTRIENT NAME.csv',
        content:
          'NutrientID,NutrientCode,NutrientName\n208,208,Energy\n203,203,Protein\n204,204,Fat\n205,205,Carbs',
      },
    ]);

    mockQuery
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({
        rows: [{ id: 'food-existing-123', provider_external_id: '571' }],
      }) // SELECT existing (found!)
      .mockResolvedValueOnce({ rowCount: 1 }) // UPDATE foods
      .mockResolvedValueOnce({ rowCount: 1 }) // DELETE food_variants
      .mockResolvedValueOnce({ rows: [] }) // INSERT food_variants
      .mockResolvedValueOnce({ rowCount: 1 }) // UPDATE meal_foods
      .mockResolvedValueOnce({ rowCount: 2 }) // UPDATE food_entries
      .mockResolvedValueOnce({ rows: [] }); // COMMIT

    const result = await importCnfFromZipBuffer('user-1', zipBuf, {
      syncPastEntries: true,
    });

    expect(result.imported).toBe(0);
    expect(result.updated).toBe(1);

    const mealUpdate = mockQuery.mock.calls.find(
      (call) =>
        typeof call[0] === 'string' && call[0].includes('UPDATE meal_foods')
    );
    expect(mealUpdate).toBeDefined();

    const entryUpdate = mockQuery.mock.calls.find(
      (call) =>
        typeof call[0] === 'string' && call[0].includes('UPDATE food_entries')
    );
    expect(entryUpdate).toBeDefined();
  });

  it('deletes library foods without touching diary entries', async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 42 });

    const result = await deleteCnfLibraryFoods('user-1');
    expect(result.deletedCount).toBe(42);
    expect(mockQuery).toHaveBeenCalledWith(
      "DELETE FROM foods WHERE provider_type = 'canadian-nutrient-file' AND user_id = $1",
      ['user-1']
    );
  });

  it('returns 0 deleted count if userId is not provided', async () => {
    const result = await deleteCnfLibraryFoods(undefined);
    expect(result.deletedCount).toBe(0);
  });
});
