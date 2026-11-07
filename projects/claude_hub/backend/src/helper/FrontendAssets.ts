import express, { Express } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { Paths } from '../paths';

/** Public bundles are independent of authenticated APIs and runtime files. */
export class FrontendAssets {
  static mount(app: Express): void {
    const built = path.join(Paths.FRONTEND_DIR, 'dist');
    app.use((req, res, next) => {
      if (req.method !== 'GET' && req.method !== 'HEAD') return next();
      const index = req.path === '/' || req.path === '/index.html';
      const asset = /^\/static\/[a-z]+\.[a-f0-9]{20}\.(js|css)$/.exec(req.path);
      if (!index && !asset) return next();
      const file = path.join(built, index ? 'index.html' : req.path.slice(1));
      if (!fs.existsSync(file)) return next();
      res.setHeader('Cache-Control', index ? 'no-cache' : 'public, max-age=31536000, immutable');
      res.vary('Accept-Encoding');
      res.type(index ? 'html' : asset![1]);
      const gzip = req.acceptsEncodings('gzip') && fs.existsSync(file + '.gz');
      if (gzip) res.setHeader('Content-Encoding', 'gzip');
      res.sendFile(gzip ? file + '.gz' : file, error => { if (error) next(error); });
    });
    // A source checkout without a build remains usable with the original HTML.
    app.use(express.static(Paths.FRONTEND_DIR));
  }
}
