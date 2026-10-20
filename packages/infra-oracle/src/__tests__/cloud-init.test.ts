import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { BOOTSTRAP_SCRIPT_PATH, buildUserData, readBootstrapScript } from '../cloud-init';
import { TEST_DEPLOY_KEY } from './helpers';

interface CloudConfig {
  write_files: Array<{
    path: string;
    permissions: string;
    owner: string;
    encoding: string;
    content: string;
  }>;
  runcmd: string[][];
}

function decodeUserData(userData: string): { header: string; body: CloudConfig } {
  const document = Buffer.from(userData, 'base64').toString('utf8');
  const newline = document.indexOf('\n');
  return {
    header: document.slice(0, newline),
    body: JSON.parse(document.slice(newline + 1)) as CloudConfig,
  };
}

describe('buildUserData', () => {
  const script = '#!/usr/bin/env bash\necho "it\'s a $test"\n';

  it('produces a base64 cloud-config document', () => {
    const { header } = decodeUserData(buildUserData(script, TEST_DEPLOY_KEY));
    expect(header).toBe('#cloud-config');
  });

  it('writes the bootstrap script byte for byte, root-only', () => {
    const { body } = decodeUserData(buildUserData(script, TEST_DEPLOY_KEY));
    expect(body.write_files).toHaveLength(1);
    const [file] = body.write_files;
    expect(file).toMatchObject({
      path: '/root/fortressauth-bootstrap.sh',
      permissions: '0700',
      owner: 'root:root',
      encoding: 'b64',
    });
    expect(Buffer.from(file?.content ?? '', 'base64').toString('utf8')).toBe(script);
  });

  it('runs the script once with the deploy key as its only argument', () => {
    const { body } = decodeUserData(buildUserData(script, TEST_DEPLOY_KEY));
    expect(body.runcmd).toEqual([['bash', '/root/fortressauth-bootstrap.sh', TEST_DEPLOY_KEY]]);
  });
});

describe('readBootstrapScript', () => {
  it('finds deploy/oracle/bootstrap-vm.sh in the repo', () => {
    expect(existsSync(BOOTSTRAP_SCRIPT_PATH)).toBe(true);
    const script = readBootstrapScript();
    expect(script.startsWith('#!/usr/bin/env bash\n')).toBe(true);
    expect(script).toMatch(/DEPLOY_PUBLIC_KEY="\$\{1:-\}"/);
  });
});
