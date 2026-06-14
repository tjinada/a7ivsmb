// Minimal ambient types for ftp-srv (the package ships no TypeScript types).
// Covers only the surface this app uses.
declare module 'ftp-srv' {
  import type { EventEmitter } from 'node:events';

  export interface FtpConnection extends EventEmitter {
    ip?: string;
  }

  export interface LoginData {
    connection: FtpConnection;
    username: string;
    password: string;
  }

  export interface LoginResolution {
    root?: string;
    cwd?: string;
  }

  export interface FtpSrvOptions {
    url?: string;
    pasv_min?: number;
    pasv_max?: number;
    pasv_url?: string;
    anonymous?: boolean;
    tls?: { key: Buffer; cert: Buffer };
    greeting?: string | string[];
  }

  export class FtpSrv extends EventEmitter {
    constructor(options?: FtpSrvOptions);
    listen(): Promise<void>;
    close(): Promise<void>;
    on(
      event: 'login',
      listener: (
        data: LoginData,
        resolve: (resolution?: LoginResolution) => void,
        reject: (error?: Error) => void,
      ) => void,
    ): this;
    on(event: 'disconnect', listener: (data: { connection: FtpConnection; id: string }) => void): this;
    on(
      event: 'client-error',
      listener: (data: { connection: FtpConnection; context: string; error: Error }) => void,
    ): this;
    on(event: string, listener: (...args: unknown[]) => void): this;
  }

  export class FileSystem {}
}
