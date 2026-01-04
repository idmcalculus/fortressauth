# @fortressauth/email-sendgrid

SendGrid email provider for FortressAuth.

## Installation

```bash
npm install @fortressauth/email-sendgrid
# or
pnpm add @fortressauth/email-sendgrid
# or
yarn add @fortressauth/email-sendgrid
```

## Usage

```ts
import { SendGridEmailProvider } from '@fortressauth/email-sendgrid';

const provider = new SendGridEmailProvider({
  apiKey: process.env.SENDGRID_API_KEY ?? '',
  fromEmail: 'noreply@yourdomain.com',
  fromName: 'Your App',
});
```

## License

MIT
