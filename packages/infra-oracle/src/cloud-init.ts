import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * The same script the README runs by hand over SSH. Reading it from the repo
 * keeps one copy: cloud-init runs it on the VM's first boot.
 */
export const BOOTSTRAP_SCRIPT_PATH = resolve(__dirname, '../../../deploy/oracle/bootstrap-vm.sh');

const BOOTSTRAP_TARGET = '/root/fortressauth-bootstrap.sh';

export function readBootstrapScript(path: string = BOOTSTRAP_SCRIPT_PATH): string {
  return readFileSync(path, 'utf8');
}

/**
 * Builds the base64 `user_data` for the instance: a cloud-config document
 * that writes bootstrap-vm.sh to disk and runs it once, as root, with the
 * deploy user's public key as its argument. Output lands in
 * /var/log/cloud-init-output.log on the VM.
 *
 * The document is JSON, which cloud-init reads as YAML, so neither the
 * script nor the key needs YAML escaping.
 */
export function buildUserData(bootstrapScript: string, deploySshPublicKey: string): string {
  const cloudConfig = {
    write_files: [
      {
        path: BOOTSTRAP_TARGET,
        permissions: '0700',
        owner: 'root:root',
        encoding: 'b64',
        content: Buffer.from(bootstrapScript, 'utf8').toString('base64'),
      },
    ],
    runcmd: [['bash', BOOTSTRAP_TARGET, deploySshPublicKey]],
  };
  const document = `#cloud-config\n${JSON.stringify(cloudConfig, null, 2)}\n`;
  return Buffer.from(document, 'utf8').toString('base64');
}
