# @fortressauth/email-smtp

SMTP email provider for FortressAuth (via nodemailer).

## Installation

```bash
npm install @fortressauth/email-smtp
# or
pnpm add @fortressauth/email-smtp
# or
yarn add @fortressauth/email-smtp
```

## Usage

```ts
import { SMTPEmailProvider } from '@fortressauth/email-smtp';

const provider = new SMTPEmailProvider({
  host: 'smtp.example.com',
  port: 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER ?? '',
    pass: process.env.SMTP_PASS ?? '',
  },
  fromEmail: 'noreply@yourdomain.com',
  fromName: 'Your App',
  tls: {
    rejectUnauthorized: false,
  },
});
```

## License

MIT
