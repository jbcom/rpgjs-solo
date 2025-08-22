declare module '@rpgjs/server' {
  export class RpgServerEngine {
    onStart?(): void | Promise<void>;
    onRequest?(req: any): any | Promise<any>;
    onMessage?(message: string, connection: any): void | Promise<void>;
    onClose?(connection: any): void | Promise<void>;
    onConnect?(connection: any, context: any): void | Promise<void>;
  }
}


