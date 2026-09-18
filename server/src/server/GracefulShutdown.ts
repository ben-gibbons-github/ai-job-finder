import type { Server as HttpServer } from 'node:http';
import type { Server as SocketServer } from 'socket.io';

interface RegisterGracefulShutdownHandlersOptions {
  io: SocketServer;
  httpServer: HttpServer;
  memoryHeartbeat: ReturnType<typeof setInterval> | null;
  shutdownTimeoutMs: number;
}

export function registerGracefulShutdownHandlers(options: RegisterGracefulShutdownHandlersOptions): void {
  const { io, httpServer, memoryHeartbeat, shutdownTimeoutMs } = options;
  let shuttingDown = false;

  async function gracefulShutdown(signal: string): Promise<void> {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    console.log(`Received ${signal}. Starting graceful shutdown...`);
    if (memoryHeartbeat) {
      clearInterval(memoryHeartbeat);
    }

    const timeout = setTimeout(() => {
      console.error(`Forced shutdown after ${shutdownTimeoutMs}ms timeout.`);
      process.exit(1);
    }, shutdownTimeoutMs);
    timeout.unref();

    try {
      await new Promise<void>((resolve) => io.close(() => resolve()));
      await new Promise<void>((resolve, reject) => {
        httpServer.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
      console.log('Graceful shutdown complete.');
      process.exit(0);
    } catch (error) {
      console.error('Shutdown failed:', error);
      process.exit(1);
    }
  }

  process.on('SIGTERM', () => {
    void gracefulShutdown('SIGTERM');
  });

  process.on('SIGINT', () => {
    void gracefulShutdown('SIGINT');
  });

  process.on('unhandledRejection', (reason) => {
    console.error('Unhandled promise rejection:', reason);
  });

  process.on('uncaughtException', (error) => {
    console.error('Uncaught exception:', error);
    void gracefulShutdown('uncaughtException');
  });
}
