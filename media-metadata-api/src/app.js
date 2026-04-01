// src/app.js
'use strict';

require('express-async-errors');

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const morgan = require('morgan');
const swaggerUi = require('swagger-ui-express');
const path = require('path');

const mediaRoutes = require('./routes/media.routes');
const mediaV2Routes = require('./routes/media.v2.routes');
const healthRoutes = require('./routes/health.routes');
const swaggerSpec = require('./config/swagger');
const { errorHandler } = require('./middleware/errorHandler');
const logger = require('./config/logger');

const swaggerOptions = {
  explorer: true,
  customCss: `
    body { background-color: #0d0f1a; }
    .swagger-ui { font-family: 'Inter', 'Segoe UI', sans-serif; }
    .swagger-ui .topbar { display: none; }
    .swagger-ui .info { margin: 20px 0; }
    .swagger-ui .info .title { color: #e0e6ff; font-size: 2em; }
    .swagger-ui .info p, .swagger-ui .info li, .swagger-ui .info table { color: #a0aac8; }
    .swagger-ui .info a { color: #7b8fff; }
    .swagger-ui .scheme-container { background: #13162b; box-shadow: none; padding: 15px 0; }
    .swagger-ui section.models { background: #13162b; border: 1px solid #2a2f4e; }
    .swagger-ui section.models h4 { color: #e0e6ff; }
    .swagger-ui .model-title { color: #c0c8f0; }
    .swagger-ui .model { color: #a0aac8; }
    .swagger-ui .opblock-tag { color: #c0c8f0; border-bottom: 1px solid #2a2f4e; }
    .swagger-ui .opblock-tag:hover { background: #1a1f38; }
    .swagger-ui .opblock { border-radius: 6px; margin: 6px 0; border: none; }
    .swagger-ui .opblock .opblock-summary { border-radius: 6px; }
    .swagger-ui .opblock.opblock-post { background: rgba(73,204,144,.08); border: 1px solid #49cc90; }
    .swagger-ui .opblock.opblock-get { background: rgba(97,175,254,.08); border: 1px solid #61affe; }
    .swagger-ui .opblock.opblock-patch { background: rgba(80,227,194,.08); border: 1px solid #50e3c2; }
    .swagger-ui .opblock.opblock-delete { background: rgba(249,62,62,.08); border: 1px solid #f93e3e; }
    .swagger-ui .opblock .opblock-summary-description { color: #a0aac8; }
    .swagger-ui .opblock-body pre { background: #0d0f1a; color: #a0aac8; }
    .swagger-ui .opblock-description-wrapper p { color: #a0aac8; }
    .swagger-ui table thead tr td, .swagger-ui table thead tr th { color: #c0c8f0; border-bottom: 1px solid #2a2f4e; }
    .swagger-ui .parameter__name { color: #e0e6ff; }
    .swagger-ui .parameter__type { color: #7b8fff; }
    .swagger-ui .parameter__in { color: #50e3c2; font-style: italic; }
    .swagger-ui textarea { background: #13162b; color: #a0aac8; border: 1px solid #2a2f4e; }
    .swagger-ui input[type=text], .swagger-ui input[type=email], .swagger-ui input[type=file] { background: #13162b; color: #e0e6ff; border: 1px solid #2a2f4e; }
    .swagger-ui select { background: #13162b; color: #e0e6ff; border: 1px solid #2a2f4e; }
    .swagger-ui .btn { border-radius: 4px; }
    .swagger-ui .btn.execute { background: #4a5fff; border-color: #4a5fff; }
    .swagger-ui .btn.execute:hover { background: #6070ff; }
    .swagger-ui .btn.cancel { border-color: #f93e3e; color: #f93e3e; }
    .swagger-ui .responses-inner h4, .swagger-ui .responses-inner h5 { color: #c0c8f0; }
    .swagger-ui .response-col_status { color: #49cc90; }
    .swagger-ui .response-col_description { color: #a0aac8; }
    .swagger-ui .highlight-code { background: #13162b; }
    .swagger-ui .microlight { background: #13162b !important; color: #a0aac8 !important; }
    #metashelf-header {
      background: linear-gradient(135deg, #0d0f1a 0%, #13162b 50%, #1a1040 100%);
      border-bottom: 1px solid #2a2f4e;
      padding: 24px 32px;
      display: flex;
      align-items: center;
      gap: 24px;
    }
    #metashelf-header img {
      height: 72px;
      width: auto;
      border-radius: 10px;
      box-shadow: 0 0 20px rgba(123,143,255,0.3);
    }
    #metashelf-header .header-text h1 {
      color: #e0e6ff;
      font-size: 1.8em;
      font-weight: 700;
      margin: 0;
      letter-spacing: -0.5px;
    }
    #metashelf-header .header-text h1 span { color: #7b8fff; }
    #metashelf-header .header-text p {
      color: #6070a0;
      margin: 4px 0 0 0;
      font-size: 0.9em;
    }
  `,
  customSiteTitle: 'Metashelf API',
  customHeadContent: `
    <div id="metashelf-header">
      <img src="/logo.png" alt="Metashelf Logo" />
      <div class="header-text">
        <h1>meta<span>shelf</span></h1>
        <p>Media Metadata API &mdash; Upload, manage &amp; stream media files</p>
      </div>
    </div>
  `,
  swaggerOptions: { persistAuthorization: true },
};

function createApp() {
  const app = express();

  // ── Security & utility middleware ──────────────────────────────────────────
  app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: false }));
  app.use(cors());
  app.use(compression());
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));

  // ── Request logging ────────────────────────────────────────────────────────
  app.use(
    morgan('combined', {
      stream: { write: (msg) => logger.http(msg.trim()) },
      skip: () => process.env.NODE_ENV === 'test',
    })
  );

  // ── Static assets ──────────────────────────────────────────────────────────
  app.use('/browser', express.static(path.join(__dirname, '../public')));
  app.get('/browser', (req, res) => res.sendFile(path.join(__dirname, '../public/starcast-media-browser.html')));
  app.use('/logo.png', express.static(path.join(__dirname, '../uploads/logo.png')));
  //app.use('/browser', express.static(path.join(__dirname, '../uploads')));
  //app.get('/browser', (req, res) => res.sendFile(path.join(__dirname, '../uploads/starcast-media-browser.html')));

  // ── Routes ─────────────────────────────────────────────────────────────────
  app.use('/health', healthRoutes);
  app.use('/api/media', mediaRoutes);
  app.use('/api/v2/media', mediaV2Routes);

  // ── OpenAPI / Swagger UI ───────────────────────────────────────────────────
  app.get('/openapi.json', (req, res) => res.json(swaggerSpec));
  app.use('/doc', swaggerUi.serve, swaggerUi.setup(swaggerSpec, swaggerOptions));

  // ── 404 handler ────────────────────────────────────────────────────────────
  app.use((req, res) => {
    res.status(404).json({ error: `Route ${req.method} ${req.path} not found` });
  });

  // ── Central error handler (must be last) ───────────────────────────────────
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
