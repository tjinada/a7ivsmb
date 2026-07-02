import { z } from 'zod';

/**
 * Body of PUT /api/ftp/config. Only the fields safe to change at runtime:
 * port and passive range are excluded because they must match the ports
 * published in docker-compose (.env + container recreate changes those).
 * An empty/absent `pass` means "keep the current password".
 */
export const ftpConfigUpdateSchema = z.object({
  enabled: z.boolean(),
  user: z.string().trim().min(1, 'Username is required').max(64, 'Username is too long'),
  pass: z.string().max(128, 'Password is too long').optional(),
  externalIp: z.string().trim().max(64, 'External IP is too long').optional().default(''),
});

export type FtpConfigUpdate = z.infer<typeof ftpConfigUpdateSchema>;
