declare module 'csv-parser' {
  import { Transform } from 'stream';
  
  interface Options {
    separator?: string;
    newline?: string;
    quote?: string;
    escape?: string;
    headers?: boolean | string[];
    mapHeaders?: (header: { header: string; index: number }) => string | null;
    mapValues?: (value: { header: string; index: number; value: string }) => any;
    strict?: boolean;
    skipLines?: number;
    maxRowBytes?: number;
    skipComments?: boolean | string;
  }

  function csv(options?: Options): Transform;
  export = csv;
}
