import * as command from '@pulumi/command';
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

function assertSameSite(value: string, name: string): 'strict' | 'lax' | 'none' {
  if (value !== 'strict' && value !== 'lax' && value !== 'none') {
    throw new Error(`Invalid ${name}. Expected one of: strict, lax, none.`);
  }
  return value;
}

type DatabaseTopology = 'dedicated-vm' | 'co-located-container';

function assertDatabaseTopology(value: string, name: string): DatabaseTopology {
  if (value !== 'dedicated-vm' && value !== 'co-located-container') {
    throw new Error(`Invalid ${name}. Expected one of: dedicated-vm, co-located-container.`);
  }
  return value;
}

function assertHostnameLabel(value: string, name: string): string {
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(value)) {
    throw new Error(
      `Invalid ${name}. Use lowercase letters, numbers, or hyphens; it must start and end with an alphanumeric character and be 63 chars or fewer.`,
    );
  }
  return value;
}

function normalizeBaseUrl(value: URL): string {
  return value.toString().replace(/\/$/, '');
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
const databaseTopology = assertDatabaseTopology(
  config.get('databaseTopology') ?? 'dedicated-vm',
  'databaseTopology',
);
const postgresImage = config.get('postgresImage')?.trim() ?? 'postgres:16-alpine';
const enableTailscale = config.getBoolean('enableTailscale') ?? false;
const tailscaleAuthKey = config.getSecret('tailscaleAuthKey');
const tailscaleControlUrl = config.get('tailscaleControlUrl')?.trim();
const tailscaleAppHostname = assertHostnameLabel(
  config.get('tailscaleAppHostname') ?? `${namePrefix}-app`,
  'tailscaleAppHostname',
);
const tailscaleDbHostname = assertHostnameLabel(
  config.get('tailscaleDbHostname') ?? `${namePrefix}-db`,
  'tailscaleDbHostname',
);
const networkZone = config.get('networkZone') ?? 'eu-central';
const networkCidr = config.get('networkCidr') ?? '10.20.0.0/16';
const subnetCidr = config.get('subnetCidr') ?? '10.20.1.0/24';
const appPrivateIp = config.get('appPrivateIp') ?? '10.20.1.10';
const dbPrivateIp = config.get('dbPrivateIp') ?? '10.20.1.20';

if (!postgresImage) {
  throw new Error('Invalid postgresImage config value.');
}

if (enableTailscale && !tailscaleAuthKey) {
  throw new Error(
    'Missing required secret config fortressauth-hetzner:tailscaleAuthKey while enableTailscale=true.',
  );
}

const appDomain = config.require('appDomain').trim();
if (!appDomain || appDomain.includes(' ')) {
  throw new Error('Invalid appDomain config value.');
}

const frontendBaseUrl = config.get('frontendBaseUrl')?.trim() || `https://${appDomain}`;
let parsedFrontendBaseUrl: URL;
try {
  parsedFrontendBaseUrl = new URL(frontendBaseUrl);
} catch {
  throw new Error('Invalid frontendBaseUrl config value.');
}

if (parsedFrontendBaseUrl.protocol !== 'http:' && parsedFrontendBaseUrl.protocol !== 'https:') {
  throw new Error('Invalid frontendBaseUrl config value.');
}
const normalizedFrontendBaseUrl = normalizeBaseUrl(parsedFrontendBaseUrl);

const cookieSameSite = assertSameSite(config.get('cookieSameSite') ?? 'lax', 'cookieSameSite');
const csrfCookieSameSite = assertSameSite(
  config.get('csrfCookieSameSite') ?? cookieSameSite,
  'csrfCookieSameSite',
);

const appImage = config.require('appImage').trim();
if (!appImage) {
  throw new Error('Invalid appImage config value.');
}

const deploySshUser = config.get('deploySshUser') ?? 'admin';
const deploySshPort = config.getNumber('deploySshPort') ?? 22;
const deploySshPrivateKey = config.getSecret('deploySshPrivateKey');
const deploySshPublicKey = config.get('deploySshPublicKey');
const enableAppDeploy = config.getBoolean('enableAppDeploy') ?? deploySshPrivateKey !== undefined;

if (enableAppDeploy && !deploySshPrivateKey) {
  throw new Error(
    'Missing required secret config fortressauth-hetzner:deploySshPrivateKey while enableAppDeploy=true.',
  );
}

const sshKeyNames = assertArray(config.requireObject<string[]>('sshKeyNames'), 'sshKeyNames');
const adminIpv4Cidrs = assertArray(
  config.requireObject<string[]>('adminIpv4Cidrs'),
  'adminIpv4Cidrs',
);
const adminIpv6Cidrs = config.getObject<string[]>('adminIpv6Cidrs') ?? [];
const deployRunnerCidr = process.env.FORTRESSAUTH_DEPLOY_RUNNER_CIDR?.trim();
const adminSourceCidrs = [
  ...new Set([
    ...adminIpv4Cidrs,
    ...adminIpv6Cidrs,
    ...(deployRunnerCidr ? [deployRunnerCidr] : []),
  ]),
];

const dbName = assertIdentifier(config.get('dbName') ?? 'fortressauth', 'dbName');
const dbUser = assertIdentifier(config.get('dbUser') ?? 'fortressauth', 'dbUser');
const dbPassword = config.requireSecret('dbPassword');
const appEnv = assertEnvRecord(config.getObject<unknown>('appEnv') ?? {}, 'appEnv');
const appSecretEnv = (config.getSecretObject<unknown>('appSecretEnv') ?? pulumi.secret({})).apply(
  (value) => assertEnvRecord(value ?? {}, 'appSecretEnv'),
);
const isCoLocatedDatabase = databaseTopology === 'co-located-container';
const activeDbPrivateAddress = isCoLocatedDatabase ? appPrivateIp : dbPrivateIp;
const databaseHost = isCoLocatedDatabase ? 'postgres' : dbPrivateIp;
const databaseSslMode = isCoLocatedDatabase ? 'disable' : 'no-verify';
const databaseUrlTemplateValue = `postgresql://${dbUser}:<db-password>@${databaseHost}:5432/${dbName}?sslmode=${databaseSslMode}`;

const enableBackups = config.getBoolean('enableBackups') ?? true;
const defaultProtectServers = /^(prod|production)$/i.test(stack);
const protectServers = config.getBoolean('protectServers') ?? defaultProtectServers;

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

const dbFirewall = isCoLocatedDatabase
  ? undefined
  : new hcloud.Firewall('dbFirewall', {
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
const dbFirewallId = dbFirewall ? dbFirewall.id.apply(parseHcloudId) : undefined;
const sshPublicKeys = pulumi.all(
  sshKeyNames.map((name) => hcloud.getSshKeyOutput({ name }).publicKey),
);

const appRuntimeFiles = pulumi
  .all([dbPassword, appSecretEnv] as const)
  .apply(([password, secretEnv]) => {
    const encodedPassword = encodeURIComponent(password || '');
    const databaseUrl = `postgresql://${dbUser}:${encodedPassword}@${databaseHost}:5432/${dbName}?sslmode=${databaseSslMode}`;

    const defaultEnvEntries: [string, string][] = [
      ['NODE_ENV', 'production'],
      ['PORT', '3000'],
      ['HOST', '0.0.0.0'],
      ['APP_IMAGE', appImage],
      ['DATABASE_URL', databaseUrl],
      ['BASE_URL', normalizedFrontendBaseUrl],
      ['COOKIE_SECURE', 'true'],
      ['COOKIE_SAMESITE', cookieSameSite],
      ['CSRF_COOKIE_SECURE', 'true'],
      ['CSRF_COOKIE_SAMESITE', csrfCookieSameSite],
      ['METRICS_ENABLED', 'true'],
      ['LOG_LEVEL', 'info'],
      ...(isCoLocatedDatabase
        ? ([
            ['POSTGRES_DB', dbName],
            ['POSTGRES_USER', dbUser],
            ['POSTGRES_PASSWORD', password || ''],
          ] as [string, string][])
        : []),
    ];

    const envContent = mergeEnvEntries(defaultEnvEntries, appEnv, secretEnv || {});

    const caddyfileContent = `${appDomain} {
  encode gzip
  reverse_proxy app:3000

  header {
    Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"
    X-Content-Type-Options "nosniff"
    X-Frame-Options "DENY"
    Referrer-Policy "strict-origin-when-cross-origin"
  }
}`;

    const composeFileContent = `services:
  app:
    image: \${APP_IMAGE}
    restart: unless-stopped
    user: "1000:1000"
    security_opt:
      - no-new-privileges:true
    cap_drop:
      - ALL
${isCoLocatedDatabase ? '    depends_on:\n      postgres:\n        condition: service_healthy\n' : ''}    env_file:
      - /opt/fortressauth/.env
    networks:
      - internal

${
  isCoLocatedDatabase
    ? `  postgres:
    image: ${postgresImage}
    restart: unless-stopped
    environment:
      POSTGRES_DB: \${POSTGRES_DB}
      POSTGRES_USER: \${POSTGRES_USER}
      POSTGRES_PASSWORD: \${POSTGRES_PASSWORD}
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U $$POSTGRES_USER -d $$POSTGRES_DB"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 10s
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - /opt/fortressauth/initdb:/docker-entrypoint-initdb.d:ro
    networks:
      - internal

`
    : ''
}  caddy:
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
${isCoLocatedDatabase ? '  postgres_data:\n' : ''}`;

    return {
      caddyfileContent,
      composeFileContent,
      envContent,
      pullServices: isCoLocatedDatabase ? 'postgres app' : 'app',
      managedServices: isCoLocatedDatabase ? 'postgres app caddy' : 'app caddy',
      postgresInitSqlContent: 'CREATE EXTENSION IF NOT EXISTS pgcrypto;',
    };
  });

const appUserData = enableTailscale
  ? pulumi.all([sshPublicKeys, tailscaleAuthKey] as const).apply(([keys, authKey]) => {
      const allKeys = [...keys];
      if (deploySshPublicKey) {
        allKeys.push(deploySshPublicKey);
      }

      const appPackageList = isCoLocatedDatabase
        ? 'ca-certificates cron curl unattended-upgrades'
        : 'ca-certificates curl unattended-upgrades';
      const coLocatedBackupSetup = isCoLocatedDatabase
        ? `
systemctl enable cron
systemctl start cron

mkdir -p /var/backups/postgresql
cat >/usr/local/bin/pg_daily_backup.sh <<'BACKUP'
#!/bin/bash
set -euo pipefail

BACKUP_DIR="/var/backups/postgresql"
COMPOSE_FILE="/opt/fortressauth/docker-compose.yml"
ENV_FILE="/opt/fortressauth/.env"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"

mkdir -p "$BACKUP_DIR"

docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec -T postgres \\
  pg_dump -U ${dbUser} -d ${dbName} -Fc >"\${BACKUP_DIR}/${dbName}_\${STAMP}.dump"
find "\${BACKUP_DIR}" -type f -name "${dbName}_*.dump" -mtime +7 -delete
BACKUP
chmod 0700 /usr/local/bin/pg_daily_backup.sh

cat >/etc/cron.d/pg_daily_backup <<'CRON'
15 2 * * * root /usr/local/bin/pg_daily_backup.sh
CRON
chmod 0644 /etc/cron.d/pg_daily_backup
`
        : '';

      return `#!/bin/bash
set -euxo pipefail

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get upgrade -y
apt-get install -y ${appPackageList}

useradd -m -s /bin/bash admin
usermod -aG sudo admin
echo "admin ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/admin
mkdir -p /home/admin/.ssh
cat >> /home/admin/.ssh/authorized_keys <<'EOF'
${allKeys.join('\n')}
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
curl -fsSL https://tailscale.com/install.sh | sh
systemctl enable tailscaled
systemctl start tailscaled
tailscale up --auth-key='${authKey || ''}' --hostname='${tailscaleAppHostname}'${tailscaleControlUrl ? ` --login-server=${tailscaleControlUrl}` : ''}

mkdir -p /opt/fortressauth
${coLocatedBackupSetup}
iptables -A OUTPUT -d 169.254.169.254 -j REJECT
`;
    })
  : sshPublicKeys.apply((keys) => {
      const allKeys = [...keys];
      if (deploySshPublicKey) {
        allKeys.push(deploySshPublicKey);
      }

      const appPackageList = isCoLocatedDatabase
        ? 'ca-certificates cron curl unattended-upgrades'
        : 'ca-certificates curl unattended-upgrades';
      const coLocatedBackupSetup = isCoLocatedDatabase
        ? `
systemctl enable cron
systemctl start cron

mkdir -p /var/backups/postgresql
cat >/usr/local/bin/pg_daily_backup.sh <<'BACKUP'
#!/bin/bash
set -euo pipefail

BACKUP_DIR="/var/backups/postgresql"
COMPOSE_FILE="/opt/fortressauth/docker-compose.yml"
ENV_FILE="/opt/fortressauth/.env"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"

mkdir -p "$BACKUP_DIR"

docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec -T postgres \\
  pg_dump -U ${dbUser} -d ${dbName} -Fc >"\${BACKUP_DIR}/${dbName}_\${STAMP}.dump"
find "\${BACKUP_DIR}" -type f -name "${dbName}_*.dump" -mtime +7 -delete
BACKUP
chmod 0700 /usr/local/bin/pg_daily_backup.sh

cat >/etc/cron.d/pg_daily_backup <<'CRON'
15 2 * * * root /usr/local/bin/pg_daily_backup.sh
CRON
chmod 0644 /etc/cron.d/pg_daily_backup
`
        : '';

      return `#!/bin/bash
set -euxo pipefail

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get upgrade -y
apt-get install -y ${appPackageList}

useradd -m -s /bin/bash admin
usermod -aG sudo admin
echo "admin ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/admin
mkdir -p /home/admin/.ssh
cat >> /home/admin/.ssh/authorized_keys <<'EOF'
${allKeys.join('\n')}
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
${coLocatedBackupSetup}
iptables -A OUTPUT -d 169.254.169.254 -j REJECT
`;
    });

const dbUserData = isCoLocatedDatabase
  ? undefined
  : enableTailscale
    ? pulumi
        .all([dbPassword, sshPublicKeys, tailscaleAuthKey] as const)
        .apply(([password, keys, authKey]) => {
          const allKeys = [...keys];
          if (deploySshPublicKey) {
            allKeys.push(deploySshPublicKey);
          }
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
${allKeys.join('\n')}
EOF
chown -R admin:admin /home/admin/.ssh
chmod 700 /home/admin/.ssh
chmod 600 /home/admin/.ssh/authorized_keys
sed -i 's/^#\\?PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config
systemctl restart ssh || systemctl restart sshd

curl -fsSL https://tailscale.com/install.sh | sh
systemctl enable tailscaled
systemctl start tailscaled
tailscale up --auth-key='${authKey || ''}' --hostname='${tailscaleDbHostname}'${tailscaleControlUrl ? ` --login-server=${tailscaleControlUrl}` : ''}

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
SQL

if ! runuser -u postgres -- psql -tAc "SELECT 1 FROM pg_database WHERE datname='${dbName}'" | grep -q 1; then
  runuser -u postgres -- createdb --owner=${dbUser} ${dbName}
fi

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
        })
    : pulumi.all([dbPassword, sshPublicKeys] as const).apply(([password, keys]) => {
        const allKeys = [...keys];
        if (deploySshPublicKey) {
          allKeys.push(deploySshPublicKey);
        }
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
${allKeys.join('\n')}
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
SQL

if ! runuser -u postgres -- psql -tAc "SELECT 1 FROM pg_database WHERE datname='${dbName}'" | grep -q 1; then
  runuser -u postgres -- createdb --owner=${dbUser} ${dbName}
fi

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

const dbServer =
  !isCoLocatedDatabase && dbUserData
    ? new hcloud.Server(
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
          firewallIds: dbFirewallId ? [dbFirewallId] : [],
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
      )
    : undefined;

if (enableAppDeploy) {
  if (!deploySshPrivateKey) {
    throw new Error(
      'Missing required secret config fortressauth-hetzner:deploySshPrivateKey while enableAppDeploy=true.',
    );
  }

  const deployConnection: command.types.input.remote.ConnectionArgs = {
    host: appServer.ipv4Address,
    user: deploySshUser,
    port: deploySshPort,
    privateKey: deploySshPrivateKey,
    // Cloud-init can take several minutes before the admin user + SSH keys are ready.
    dialErrorLimit: 120,
    perDialTimeout: 15,
  };

  const deployScript = appRuntimeFiles.apply(
    ({
      caddyfileContent,
      composeFileContent,
      envContent,
      managedServices,
      postgresInitSqlContent,
      pullServices,
    }) => `set -euo pipefail

ENV_FILE="/opt/fortressauth/.env"
COMPOSE_FILE="/opt/fortressauth/docker-compose.yml"
CADDY_FILE="/opt/fortressauth/Caddyfile"
INITDB_DIR="/opt/fortressauth/initdb"
PGCRYPTO_SQL="$INITDB_DIR/001-pgcrypto.sql"

sudo mkdir -p /opt/fortressauth
${isCoLocatedDatabase ? 'sudo mkdir -p "$INITDB_DIR"\n' : ''}

cat <<'ENVFILE' | sudo tee "$ENV_FILE" >/dev/null
${envContent}
ENVFILE
sudo chmod 0600 "$ENV_FILE"

cat <<'CADDYFILE' | sudo tee "$CADDY_FILE" >/dev/null
${caddyfileContent}
CADDYFILE

cat <<'COMPOSE' | sudo tee "$COMPOSE_FILE" >/dev/null
${composeFileContent}
COMPOSE
${
  isCoLocatedDatabase
    ? `cat <<'PGCRYPTO' | sudo tee "$PGCRYPTO_SQL" >/dev/null
${postgresInitSqlContent}
PGCRYPTO
sudo chmod 0644 "$PGCRYPTO_SQL"
`
    : ''
}

sudo docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" pull ${pullServices}
sudo docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d --force-recreate ${managedServices}
sudo docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" ps ${managedServices}
sudo docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" logs --tail=50 ${managedServices}

curl -fsS --retry 10 --retry-all-errors --retry-delay 3 -H "Host: ${appDomain}" http://127.0.0.1/health >/dev/null`,
  );
  const deployScriptWithBootstrapWait = pulumi.interpolate`cloud-init status --wait\n\n${deployScript}`;
  const deployDependencies: pulumi.Resource[] = dbServer
    ? [appFirewall, appServer, dbServer]
    : [appFirewall, appServer];

  new command.remote.Command(
    'deployApp',
    {
      connection: deployConnection,
      create: deployScriptWithBootstrapWait,
      // Updates can run against a freshly replaced server, so they must wait for cloud-init too.
      update: deployScriptWithBootstrapWait,
      // Keep the remote command idempotent; a new image digest is the only redeploy trigger.
      triggers: [appImage],
    },
    { dependsOn: deployDependencies },
  );
}

export const appUrl = pulumi.interpolate`https://${appDomain}`;
export const appPublicIpv4 = appServer.ipv4Address;
export const appPublicIpv6 = appServer.ipv6Address;
export const appPrivateAddress = appPrivateIp;
export const dbPrivateAddress = activeDbPrivateAddress;
export const dbServerId = dbServer ? dbServer.id : pulumi.output('co-located');
export const sshApp = pulumi.interpolate`ssh admin@${appServer.ipv4Address}`;
export const sshAppTailscale = enableTailscale
  ? pulumi.output(`ssh admin@${tailscaleAppHostname}`)
  : pulumi.output('disabled');
export const sshDbViaApp = isCoLocatedDatabase
  ? pulumi.interpolate`ssh admin@${appServer.ipv4Address} -t 'cd /opt/fortressauth && sudo docker compose exec postgres psql -U ${dbUser} -d ${dbName}'`
  : pulumi.interpolate`ssh -J admin@${appServer.ipv4Address} admin@${dbPrivateIp}`;
export const sshDbTailscale = enableTailscale
  ? pulumi.output(`ssh admin@${isCoLocatedDatabase ? tailscaleAppHostname : tailscaleDbHostname}`)
  : pulumi.output('disabled');
export const tailscaleEnabled = pulumi.output(enableTailscale);
export const tailscaleAppHostnameOutput = enableTailscale
  ? pulumi.output(tailscaleAppHostname)
  : pulumi.output('disabled');
export const tailscaleDbHostnameOutput = enableTailscale
  ? pulumi.output(isCoLocatedDatabase ? tailscaleAppHostname : tailscaleDbHostname)
  : pulumi.output('disabled');
export const databaseUrlTemplate = databaseUrlTemplateValue;
