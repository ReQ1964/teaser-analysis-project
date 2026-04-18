import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import multer from 'multer';
import admin from 'firebase-admin';
import { VideoIntelligenceServiceClient } from '@google-cloud/video-intelligence';
import path from 'path';
import { fileURLToPath } from 'url';
import { Datastore } from '@google-cloud/datastore';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8080;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// --- Inicjalizacja Firebase (tylko Storage) ---
if (!admin.apps.length) {
  admin.initializeApp({
    projectId: 'project-e5e273bc-6800-4c40-a72',
    storageBucket: 'project-e5e273bc-6800-4c40-a72.appspot.com'
  });
  console.log('Firebase initialized (Production Mode)');
}

const datastore = new Datastore({ projectId: 'project-e5e273bc-6800-4c40-a72' });
const bucket = admin.storage().bucket();
const videoClient = new VideoIntelligenceServiceClient();

// --- Middleware ---
app.use(cors({
  origin: process.env.ALLOWED_ORIGIN || '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));
app.use(express.json());
app.use(express.static(path.join(rootDir, 'dist')));

// --- Multer ---
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: { fileSize: 50 * 1024 * 1024 }
});

// --- Endpoint: Upload ---
app.post('/api/upload', upload.single('teaser'), async (req: any, res: any) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { buffer, originalname, mimetype } = req.file;
    const destination = `teasers/${Date.now()}_${originalname}`;
    const file = bucket.file(destination);

    await file.save(buffer, {
      metadata: { contentType: mimetype },
      resumable: false
    });

    const gcsUri = `gs://${bucket.name}/${destination}`;

    const key = datastore.key('teasers');
    const entity = {
      key,
      data: {
        name: originalname,
        status: 'processing',
        tags: [],
        gcsUri,
        createdAt: new Date().toISOString()
      }
    };
    await datastore.save(entity);

    const id = key.id?.toString() || key.name?.toString() || '';
    processVideo(gcsUri, id);

    res.status(200).json({ id, message: 'Processing started' });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// --- Endpoint: Get Teasers ---
app.get('/api/teasers', async (_req: any, res: any) => {
  try {
    const query = datastore.createQuery('teasers').order('createdAt', { descending: true });
    const [entities] = await datastore.runQuery(query);

    const teasers = entities.map(entity => ({
      id: entity[datastore.KEY].id || entity[datastore.KEY].name,
      ...entity
    }));

    res.json(teasers);
  } catch (error) {
    console.error('Fetch error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// --- Funkcja przetwarzająca wideo ---
async function processVideo(gcsUri: string, docId: string) {
  try {
    const request = {
      inputUri: gcsUri,
      features: ['LABEL_DETECTION' as any],
    };

    const [operation] = await videoClient.annotateVideo(request);
    const [operationResult] = await operation.promise();

    const annotations = operationResult.annotationResults?.[0];
    const labels = annotations?.segmentLabelAnnotations || [];
    const tags = labels.map(label => label.entity!.description);

    const key = datastore.key(['teasers', parseInt(docId)]);
    const [existing] = await datastore.get(key);
    await datastore.save({
      key,
      data: { ...existing, tags, status: 'processed' }
    });
  } catch (error) {
    console.error('Video processing error:', error);
    const key = datastore.key(['teasers', parseInt(docId)]);
    const [existing] = await datastore.get(key);
    await datastore.save({
      key,
      data: { ...existing, status: 'error' }
    });
  }
}

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});