# FortressAuth Oracle Cloud Pulumi

This Pulumi stack creates the Oracle Cloud side of the single-VM deployment
in [`deploy/oracle`](../../deploy/oracle/README.md):

- A VCN with one public subnet, an internet gateway and a route table
- A security list that opens SSH (22), HTTP (80), HTTPS (443/tcp) and
  HTTP/3 (443/udp), plus ICMP for path MTU discovery. Nothing else is open,
  so PostgreSQL and the app port are never reachable from outside.
- One `VM.Standard.A1.Flex` instance (Ampere, arm64) running the newest
  Canonical Ubuntu 24.04 image. On first boot, cloud-init runs
  [`deploy/oracle/bootstrap-vm.sh`](../../deploy/oracle/bootstrap-vm.sh): it
  opens the host firewall, installs Docker, creates the `deploy` user and
  adds the nightly backup timer.
- A private Object Storage bucket for backups, and a write-only upload URL
  for `BACKUP_PAR_URL`

Within Oracle's Always Free limits (2 OCPUs and 12 GB of A1, 200 GB of
block storage, 20 GB of Object Storage) all of this costs nothing.

The stack does not deploy the app, write `.env` or `app.env` on the VM, or
touch DNS. GitHub Actions deploys the app
([`deploy-oracle.yml`](../../.github/workflows/deploy-oracle.yml)), and the
rest are manual steps in the `deploy/oracle` README.

## Before you start

1. **Oracle account.** Sign up at [cloud.oracle.com](https://cloud.oracle.com).
   The home region you pick is the only place you can create Always Free A1
   VMs, and you cannot change it later.
2. **API key for Pulumi.** In the Oracle console, open **Profile → My
   profile → API keys → Add API key**, choose **Generate API key pair**, and
   download the private key to `~/.oci/oci_api_key.pem` (`chmod 600`). Paste
   the configuration preview Oracle shows into `~/.oci/config` and set
   `key_file=~/.oci/oci_api_key.pem`. The provider reads the `DEFAULT`
   profile; set `oci:configFileProfile` in the stack config to use another.
3. **Pulumi.** Log in to the same Pulumi Cloud organisation as the AWS
   stacks: `pulumi login`.
4. **Deploy key.** Make a key that only GitHub Actions uses:

   ```bash
   ssh-keygen -t ed25519 -f ~/.ssh/fortressauth-deploy -N '' -C fortressauth-deploy
   ```

## First run

```bash
cd packages/infra-oracle
pulumi stack init idmcalculus/fortressauth-oracle/prod
cp Pulumi.prod.example.yaml Pulumi.prod.yaml
```

Fill in `Pulumi.prod.yaml`: the region, the tenancy OCID, your own SSH
public key and the deploy public key (`~/.ssh/fortressauth-deploy.pub`).
Then check the plan and apply it:

```bash
pulumi preview --diff
pulumi up
```

`pulumi up` asks for confirmation before it creates anything. When it
finishes:

```bash
pulumi stack output instancePublicIp
pulumi stack output backupUploadUrl --show-secrets
```

The first boot takes a few minutes while cloud-init installs Docker. To
watch it:

```bash
ssh ubuntu@$(pulumi stack output instancePublicIp) \
  'cloud-init status --wait; tail -n 20 /var/log/cloud-init-output.log'
```

Then carry on from section 3 of
[`deploy/oracle/README.md`](../../deploy/oracle/README.md). Put the
`backupUploadUrl` output in `BACKUP_PAR_URL` in the VM's `.env`.

## "Out of host capacity"

Free A1 capacity often runs out. When Oracle has none, `pulumi up` fails on
the instance with "Out of host capacity", but the network and bucket are
already in place. Try, in order:

- Another availability domain:
  `pulumi config set fortressauth-oracle:availabilityDomainIndex 1`
  (or `2`, where the region has three)
- A smaller VM: `ocpus: 1` and `memoryGb: 6`
- Running `pulumi up` again later. `scripts/oracle-launch-retry.sh` does this
  for you: it tries every availability domain, waits 10 minutes, and repeats
  for up to 24 hours, stopping at the first launch. Leave it running in a
  terminal; slots often free up overnight.

## Changing things later

- **Size.** Changing `ocpus` or `memoryGb` updates the VM in place; Oracle
  restarts it to apply the change.
- **Bootstrap script or Ubuntu image.** The stack ignores later changes to
  the image and to instance metadata (SSH key and first-boot script), so
  neither replaces the VM and wipes its database. Re-run `bootstrap-vm.sh`
  over SSH instead (see the `deploy/oracle` README).
- **Upload URL expiry.** Oracle cannot extend a pre-authenticated request.
  Changing `backupUploadExpires` makes Pulumi replace it, so copy the new
  `backupUploadUrl` into `.env` afterwards.

## Tearing it down

The VM's boot volume holds the database, so the stack guards it twice:
Pulumi protects the instance, and Oracle keeps the boot volume when the
instance is deleted. To remove everything:

```bash
pulumi config set fortressauth-oracle:protectInstance false
pulumi up
pulumi destroy
```

`pulumi destroy` cannot delete the backup bucket while it holds objects;
empty it first if you mean to. Afterwards, delete the kept boot volume under
**Storage → Block Storage → Boot Volumes** once you no longer need it.

## Files

- `Pulumi.yaml`: project definition
- `Pulumi.prod.example.yaml`: stack config template
- `src/config.ts`: reads and checks stack config
- `src/network.ts`: VCN, internet gateway, route table, security list, subnet
- `src/compute.ts`: the A1 instance, its image and availability domain
- `src/cloud-init.ts`: wraps `bootstrap-vm.sh` as first-boot `user_data`
- `src/storage.ts`: backup bucket and write-only upload URL
- `src/index.ts`: wires the pieces together and exports the outputs

## Tests

```bash
pnpm --filter @fortressauth/infra-oracle test
```

The tests use Pulumi's mocks, so they need neither an Oracle account nor
network access. CI runs them, with lint and typecheck, whenever this package
or `deploy/oracle` changes.
