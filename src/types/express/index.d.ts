// src/types/express/index.d.ts

declare namespace Express {
  interface Request {
    auth?: {
      id: string;
      // add whatever fields your JWT or DB user has
    };
  }
}
