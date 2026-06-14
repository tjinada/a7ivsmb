// Load environment variables before anything else imports `config`.
// The backend's working directory is packages/backend (pnpm runs filtered
// scripts there), but .env lives at the monorepo root — so resolve it
// explicitly. In Docker there is no .env file and real env vars are used;
// a missing file here is harmless.
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, '../../../.env') });
