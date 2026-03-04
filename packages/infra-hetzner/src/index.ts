import * as hcloud from '@pulumi/hcloud';
import * as pulumi from '@pulumi/pulumi';

function parseHcloudId(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Expected numeric Hetzner ID, got: ${value}`);
  }
  return parsed;
}

function assertArray<T>(value: T[] | undefined, name: string): T[] {
  if (!value || value.length === 0) {
    throw new Error(`Missing required non-empty array config: ${name}`);
  }
  return value;
}

function assertIdentifier(value: string, name: string): string {
  if (!/^[a-z_][a-z0-9_]*$/.test(value)) {
    throw new Error(
      `Invalid ${name}. Use lowercase letters, numbers, and underscores; first character must be a letter or underscore.`,
    );
  }
  return value;
}

function escapeSqlLiteral(value: string): string {
  return value.replace(/'/g, "''");
}

type EnvRecord = Record<string, string>;

function assertPlainObject(value: unknown, name: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`Invalid ${name}. Expected an object map of KEY=VALUE pairs.`);
  }
  return value as Record<string, unknown>;
}

function assertEnvKey(key: string, name: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
    throw new Error(`Invalid env key "${key}" in ${name}.`);
  }
  return key;
}

function assertEnvValue(value: string, name: string, key: string): string {
  if (value.includes('\n') || value.includes('\r')) {
    throw new Error(`Invalid ${name}.${key}. Multiline values are not supported.`);
  }
  return value;
}

function assertEnvRecord(value: unknown, name: string): EnvRecord {
  const objectValue = assertPlainObject(value, name);
  const parsed: EnvRecord = {};

  for (const [key, rawValue] of Object.entries(objectValue)) {
    const envKey = assertEnvKey(key, name);
    if (typeof rawValue !== 'string') {
      throw new Error(`Invalid ${name}.${envKey}. Expected a string value.`);
    }
    parsed[envKey] = assertEnvValue(rawValue, name, envKey);
  }

  return parsed;
}

function mergeEnvEntries(
  defaultEntries: readonly [string, string][],
  ...overrides: EnvRecord[]
): string {
  const env = new Map<string, string>(defaultEntries);

  for (const override of overrides) {
    const entries = Object.entries(override).sort(([left], [right]) => left.localeCompare(right));
    for (const [key, value] of entries) {
      env.set(key, value);
    }
  }

  const defaultKeys = new Set(defaultEntries.map(([key]) => key));
  const lines: string[] = [];

  for (const [key] of defaultEntries) {
    const value = env.get(key);
    if (value === undefined) {
      throw new Error(`Missing default environment value for ${key}.`);
    }
    lines.push(`${key}=${value}`);
  }

  const extraKeys = [...env.keys()]
    .filter((key) => !defaultKeys.has(key))
    .sort((left, right) => left.localeCompare(right));
  for (const key of extraKeys) {
    const value = env.get(key);
    if (value === undefined) {
      throw new Error(`Missing merged environment value for ${key}.`);
    }
    lines.push(`${key}=${value}`);
  }

  return lines.join('\n');
}

const config = new pulumi.Config();
const stack = pulumi.getStack();

const namePrefix = config.get('namePrefix') ?? `fortressauth-${stack}`;
const location = config.get('location') ?? 'nbg1';
const image = config.get('image') ?? 'ubuntu-24.04';
const appServerType = config.get('appServerType') ?? 'cpx21';
const dbServerType = config.get('dbServerType') ?? 'cpx31';
const networkZone = config.get('networkZone') ?? 'eu-central';
const networkCidr = config.get('networkCidr') ?? '10.20.0.0/16';
const subnetCidr = config.get('subnetCidr') ?? '10.20.1.0/24';
const appPrivateIp = config.get('appPrivateIp') ?? '10.20.1.10';
const dbPrivateIp = config.get('dbPrivateIp') ?? '10.20.1.20';

const appDomain = config.require('appDomain').trim();
if (!appDomain || appDomain.includes(' ')) {
  throw new Error('Invalid appDomain config value.');
}

const appImage = config.require('appImage').trim();
if (!appImage) {
  throw new Error('Invalid appImage config value.');
}

const sshKeyNames = assertArray(config.requireObject<string[]>('sshKeyNames'), 'sshKeyNames');
const adminIpv4Cidrs = assertArray(
  config.requireObject<string[]>('adminIpv4Cidrs'),
  'adminIpv4Cidrs',
);
const adminIpv6Cidrs = config.getObject<string[]>('adminIpv6Cidrs') ?? [];
const adminSourceCidrs = [...adminIpv4Cidrs, ...adminIpv6Cidrs];

const dbName = assertIdentifier(config.get('dbName') ?? 'fortressauth', 'dbName');
const dbUser = assertIdentifier(config.get('dbUser') ?? 'fortressauth', 'dbUser');
const dbPassword = config.requireSecret('dbPassword');
const appEnv = assertEnvRecord(config.getObject<unknown>('appEnv') ?? {}, 'appEnv');
const appSecretEnv = (config.getSecretObject<unknown>('appSecretEnv') ?? pulumi.secret({})).apply(
  (value) => assertEnvRecord(value ?? {}, 'appSecretEnv'),
);

const enableBackups = config.getBoolean('enableBackups') ?? true;
const protectServers = config.getBoolean('protectServers') ?? true;

const commonLabels = {
  'managed-by': 'pulumi',
  project: 'fortressauth',
  stack,
};

const privateNetwork = new hcloud.Network('privateNetwork', {
  name: `${namePrefix}-private`,
  ipRange: networkCidr,
  labels: commonLabels,
});

const privateNetworkId = privateNetwork.id.apply(parseHcloudId);

const privateSubnet = new hcloud.NetworkSubnet('privateSubnet', {
  networkId: privateNetworkId,
  type: 'cloud',
  networkZone,
  ipRange: subnetCidr,
});

const spreadPlacementGroup = new hcloud.PlacementGroup('spreadPlacementGroup', {
  name: `${namePrefix}-spread`,
  type: 'spread',
  labels: commonLabels,
});

const spreadPlacementGroupId = spreadPlacementGroup.id.apply(parseHcloudId);

const appFirewall = new hcloud.Firewall('appFirewall', {
  name: `${namePrefix}-app-fw`,
  labels: {
    ...commonLabels,
    role: 'app',
  },
  rules: [
    {
      direction: 'in',
      protocol: 'icmp',
      sourceIps: ['0.0.0.0/0', '::/0'],
    },
    {
      direction: 'in',
      protocol: 'tcp',
      port: '22',
      sourceIps: adminSourceCidrs,
    },
    {
      direction: 'in',
      protocol: 'tcp',
      port: '80',
      sourceIps: ['0.0.0.0/0', '::/0'],
    },
    {
      direction: 'in',
      protocol: 'tcp',
      port: '443',
      sourceIps: ['0.0.0.0/0', '::/0'],
    },
  ],
});

const dbFirewall = new hcloud.Firewall('dbFirewall', {
  name: `${namePrefix}-db-fw`,
  labels: {
    ...commonLabels,
    role: 'db',
  },
  rules: [
    {
      direction: 'in',
      protocol: 'tcp',
      port: '22',
      sourceIps: adminSourceCidrs,
    },
    {
      direction: 'in',
      protocol: 'tcp',
      port: '5432',
      sourceIps: [`${appPrivateIp}/32`],
    },
  ],
});

const appFirewallId = appFirewall.id.apply(parseHcloudId);
const dbFirewallId = dbFirewall.id.apply(parseHcloudId);

const appUserData = pulumi
  .all([
    dbPassword,
    appSecretEnv,
    pulumi.all(sshKeyNames.map((k) => hcloud.getSshKeyOutput({ name: k }).publicKey)),
  ] as const)
  .apply(([password, secretEnv, keys]) => {
    const encodedPassword = encodeURIComponent(password || '');
    const databaseUrl = `postgresql://${dbUser}:${encodedPassword}@${dbPrivateIp}:5432/${dbName}?sslmode=require`;

    const defaultEnvEntries: [string, string][] = [
      ['NODE_ENV', 'production'],
      ['PORT', '3000'],
      ['HOST', '0.0.0.0'],
      ['DATABASE_URL', databaseUrl],
      ['BASE_URL', `https://${appDomain}`],
      ['COOKIE_SECURE', 'true'],
      ['COOKIE_SAMESITE', 'none'],
      ['CSRF_COOKIE_SECURE', 'true'],
      ['CSRF_COOKIE_SAMESITE', 'none'],
      ['METRICS_ENABLED', 'true'],
      ['LOG_LEVEL', 'info'],
    ];

    const envContent = mergeEnvEntries(defaultEnvEntries, appEnv, secretEnv || {});

    return `#!/bin/bash
set -euxo pipefail

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get upgrade -y
apt-get install -y ca-certificates curl unattended-upgrades

useradd -m -s /bin/bash admin
usermod -aG sudo admin
echo "admin ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/admin
mkdir -p /home/admin/.ssh
cat >> /home/admin/.ssh/authorized_keys <<'EOF'
${keys.join('\n')}
EOF
chown -R admin:admin /home/admin/.ssh
chmod 700 /home/admin/.ssh
chmod 600 /home/admin/.ssh/authorized_keys
sed -i 's/^#\\?PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config
systemctl restart ssh || systemctl restart sshd

curl -fsSL https://get.docker.com | sh
apt-get install -y docker-compose-plugin
systemctl enable docker
systemctl start docker
usermod -aG docker admin

mkdir -p /opt/fortressauth

cat >/opt/fortressauth/.env <<'ENVFILE'
${envContent}
ENVFILE
chmod 0600 /opt/fortressauth/.env

cat >/opt/fortressauth/Caddyfile <<'CADDYFILE'
${appDomain} {
  encode gzip
  reverse_proxy app:3000

  header {
    Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"
    X-Content-Type-Options "nosniff"
    X-Frame-Options "DENY"
    Referrer-Policy "strict-origin-when-cross-origin"
  }
}
CADDYFILE

cat >/opt/fortressauth/docker-compose.yml <<'COMPOSE'
services:
  app:
    image: ${appImage}
    restart: unless-stopped
    user: "1000:1000"
    security_opt:
      - no-new-privileges:true
    cap_drop:
      - ALL
    env_file:
      - /opt/fortressauth/.env
    networks:
      - internal

  caddy:
    image: caddy:2.10-alpine
    restart: unless-stopped
    depends_on:
      - app
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - /opt/fortressauth/Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config
    networks:
      - internal

networks:
  internal:

volumes:
  caddy_data:
  caddy_config:
COMPOSE

docker compose -f /opt/fortressauth/docker-compose.yml pull
docker compose -f /opt/fortressauth/docker-compose.yml up -d

iptables -A OUTPUT -d 169.254.169.254 -j REJECT
`;
  });

const dbUserData = pulumi
  .all([
    dbPassword,
    pulumi.all(sshKeyNames.map((k) => hcloud.getSshKeyOutput({ name: k }).publicKey)),
  ] as const)
  .apply(([password, keys]) => {
    const escapedPassword = escapeSqlLiteral(password || '');

    return `#!/bin/bash
set -euxo pipefail

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get upgrade -y
apt-get install -y postgresql postgresql-contrib unattended-upgrades

useradd -m -s /bin/bash admin
usermod -aG sudo admin
echo "admin ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/admin
mkdir -p /home/admin/.ssh
cat >> /home/admin/.ssh/authorized_keys <<'EOF'
${keys.join('\n')}
EOF
chown -R admin:admin /home/admin/.ssh
chmod 700 /home/admin/.ssh
chmod 600 /home/admin/.ssh/authorized_keys
sed -i 's/^#\\?PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config
systemctl restart ssh || systemctl restart sshd

PG_VERSION="$(ls /etc/postgresql | sort -V | tail -n 1)"
PG_CONF="/etc/postgresql/\${PG_VERSION}/main/postgresql.conf"
PG_HBA="/etc/postgresql/\${PG_VERSION}/main/pg_hba.conf"

if grep -q "^#listen_addresses" "$PG_CONF"; then
  sed -i "s/^#listen_addresses =.*/listen_addresses = 'localhost,${dbPrivateIp}'/" "$PG_CONF"
elif grep -q "^listen_addresses" "$PG_CONF"; then
  sed -i "s/^listen_addresses =.*/listen_addresses = 'localhost,${dbPrivateIp}'/" "$PG_CONF"
else
  echo "listen_addresses = 'localhost,${dbPrivateIp}'" >>"$PG_CONF"
fi

if ! grep -q "^password_encryption = scram-sha-256" "$PG_CONF"; then
  echo "password_encryption = scram-sha-256" >>"$PG_CONF"
fi

if ! grep -q "^ssl = on" "$PG_CONF"; then
  echo "ssl = on" >> "$PG_CONF"
fi

if ! grep -q "hostssl ${dbName} ${dbUser} ${appPrivateIp}/32 scram-sha-256" "$PG_HBA"; then
  echo "hostssl ${dbName} ${dbUser} ${appPrivateIp}/32 scram-sha-256" >>"$PG_HBA"
fi

systemctl enable postgresql
systemctl restart postgresql

runuser -u postgres -- psql <<'SQL'
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${dbUser}') THEN
    CREATE ROLE ${dbUser} LOGIN PASSWORD '${escapedPassword}';
  ELSE
    ALTER ROLE ${dbUser} WITH LOGIN PASSWORD '${escapedPassword}';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_database WHERE datname = '${dbName}') THEN
    CREATE DATABASE ${dbName} OWNER ${dbUser};
  END IF;
END $$;
SQL

runuser -u postgres -- psql -d ${dbName} -c "CREATE EXTENSION IF NOT EXISTS pgcrypto;"

mkdir -p /var/backups/postgresql
cat >/usr/local/bin/pg_daily_backup.sh <<'BACKUP'
#!/bin/bash
set -euo pipefail

BACKUP_DIR="/var/backups/postgresql"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"

runuser -u postgres -- pg_dump -Fc ${dbName} >"\${BACKUP_DIR}/${dbName}_\${STAMP}.dump"
find "\${BACKUP_DIR}" -type f -name "${dbName}_*.dump" -mtime +7 -delete
BACKUP
chmod 0700 /usr/local/bin/pg_daily_backup.sh

cat >/etc/cron.d/pg_daily_backup <<'CRON'
15 2 * * * root /usr/local/bin/pg_daily_backup.sh
CRON
chmod 0644 /etc/cron.d/pg_daily_backup

iptables -A OUTPUT -d 169.254.169.254 -j REJECT
`;
  });

const appServer = new hcloud.Server(
  'appServer',
  {
    name: `${namePrefix}-app`,
    image,
    serverType: appServerType,
    location,
    sshKeys: sshKeyNames,
    backups: enableBackups,
    deleteProtection: protectServers,
    rebuildProtection: protectServers,
    placementGroupId: spreadPlacementGroupId,
    firewallIds: [appFirewallId],
    publicNets: [
      {
        ipv4Enabled: true,
        ipv6Enabled: true,
      },
    ],
    networks: [
      {
        networkId: privateNetworkId,
        ip: appPrivateIp,
      },
    ],
    userData: appUserData,
    labels: {
      ...commonLabels,
      role: 'app',
    },
  },
  { dependsOn: [privateSubnet] },
);

const dbServer = new hcloud.Server(
  'dbServer',
  {
    name: `${namePrefix}-db`,
    image,
    serverType: dbServerType,
    location,
    sshKeys: sshKeyNames,
    backups: enableBackups,
    deleteProtection: protectServers,
    rebuildProtection: protectServers,
    placementGroupId: spreadPlacementGroupId,
    firewallIds: [dbFirewallId],
    publicNets: [
      {
        ipv4Enabled: true,
        ipv6Enabled: true,
      },
    ],
    networks: [
      {
        networkId: privateNetworkId,
        ip: dbPrivateIp,
      },
    ],
    userData: dbUserData,
    labels: {
      ...commonLabels,
      role: 'db',
    },
  },
  { dependsOn: [privateSubnet] },
);

export const appUrl = pulumi.interpolate`https://${appDomain}`;
export const appPublicIpv4 = appServer.ipv4Address;
export const appPublicIpv6 = appServer.ipv6Address;
export const appPrivateAddress = appPrivateIp;
export const dbPrivateAddress = dbPrivateIp;
export const dbServerId = dbServer.id;
export const sshApp = pulumi.interpolate`ssh admin@${appServer.ipv4Address}`;
export const sshDbViaApp = pulumi.interpolate`ssh -J admin@${appServer.ipv4Address} admin@${dbPrivateIp}`;
export const databaseUrlTemplate = `postgresql://${dbUser}:<db-password>@${dbPrivateIp}:5432/${dbName}?sslmode=require`;
