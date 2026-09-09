const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  analyzeOrganization,
  getStaticImportedNames,
  validateOrganizationRule,
} = require('../lib/organization.cjs');

const makeProject = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'quality-scanner-org-'));
  fs.mkdirSync(path.join(root, 'src', 'components', 'Purchases', '__test__'), {
    recursive: true,
  });
  fs.writeFileSync(
    path.join(root, 'src', 'components', 'Purchases', 'Purchases.tsx'),
    'export const PURCHASE_STATUS = "paid";\n',
  );
  fs.writeFileSync(
    path.join(root, 'src', 'components', 'Purchases', '__test__', 'Purchases.test.tsx'),
    'import Purchases from "../Purchases";\n',
  );
  fs.writeFileSync(
    path.join(root, 'src', 'consumer.ts'),
    'import { PURCHASE_STATUS } from "./components/Purchases/Purchases";\n',
  );
  return root;
};

describe('organization rules', () => {
  it('recognizes static named and default imports only', () => {
    const imports = getStaticImportedNames(
      'import Purchases, { PURCHASE_STATUS as STATUS } from "./Purchases";',
    );
    assert.deepEqual(imports[0].names, [
      { imported: 'default', local: 'Purchases' },
      { imported: 'PURCHASE_STATUS', local: 'STATUS' },
    ]);
    assert.deepEqual(getStaticImportedNames(
      'const value = require("./Purchases"); import("./Purchases");',
    ), []);
  });

  it('enforces a test target path template', () => {
    const root = makeProject();
    const target = path.join(root, 'src', 'components', 'Purchases', 'Purchases.tsx');
    const test = path.join(
      root,
      'src',
      'components',
      'Purchases',
      '__test__',
      'Purchases.test.tsx',
    );
    const result = analyzeOrganization({
      files: [target, test],
      targetToTests: new Map([[target, [test]]]),
      root,
      config: {
        organizationRules: [{
          id: 'component-test-convention',
          type: 'test-target',
          targetPattern: /^(?<directory>src\/components\/(?<name>[^/]+))\/\k<name>\.(?<ext>tsx?)$/,
          testPathTemplate: '$<directory>/__test__/$<name>.test.$<ext>',
        }],
      },
    })[0];
    assert.equal(result.findings.length, 0);
  });

  it('enforces shared exported constant locations', () => {
    const root = makeProject();
    const target = path.join(root, 'src', 'components', 'Purchases', 'Purchases.tsx');
    const consumer = path.join(root, 'src', 'consumer.ts');
    const result = analyzeOrganization({
      files: [target, consumer],
      targetToTests: new Map(),
      root,
      config: {
        organizationRules: [{
          id: 'shared-constants-location',
          type: 'shared-symbol-location',
          symbolType: 'constant',
          symbolPattern: /^PURCHASE_STATUS$/,
          allowedFilePattern: /constants\.[jt]s$/,
          minimumConsumers: 1,
        }],
      },
    })[0];
    assert.equal(result.findings.length, 1);
    assert.equal(result.findings[0].path, 'src/components/Purchases/Purchases.tsx');
    assert.equal(result.findings[0].ruleFamily, 'organization');
  });

  it('validates organization rule types', () => {
    assert.throws(
      () => validateOrganizationRule({ id: 'bad', type: 'unknown' }),
      /type/,
    );
  });
});
