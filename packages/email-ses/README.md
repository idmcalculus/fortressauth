# @fortressauth/email-ses

AWS SES email provider for FortressAuth.

## Installation

```bash
npm install @fortressauth/email-ses
# or
pnpm add @fortressauth/email-ses
# or
yarn add @fortressauth/email-ses
```

## Usage

```ts
import { SESEmailProvider } from '@fortressauth/email-ses';

const provider = new SESEmailProvider({
  region: 'us-east-1',
  fromEmail: 'noreply@yourdomain.com',
  fromName: 'Your App',
  credentials: {
    accessKeyId: process.env.SES_ACCESS_KEY_ID ?? '',
    secretAccessKey: process.env.SES_SECRET_ACCESS_KEY ?? '',
    sessionToken: process.env.SES_SESSION_TOKEN,
  },
});
```

## License

MIT
