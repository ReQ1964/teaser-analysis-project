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

// Konfiguracja ścieżek ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Zgodnie z Twoim screenem:
 * Serwer jest w: dist/server/index.js
 * Frontend jest w: dist/
 * Musimy wyjść o jeden poziom w górę (..), aby serwować pliki z dist/
 */
const distPath = path.resolve(__dirname, '..');

// --- Inicjalizacja Google Cloud Services ---
if (!admin.apps.length) {
  admin.initializeApp({
    projectId: 'project-e5e273bc-6800-4c40-a72',
    storageBucket: 'project-e5e273bc-6800-4c40-a72.appspot.com'
  });
}

const datastore = new Datastore();
const bucket = admin.storage().bucket();
const videoClient = new VideoIntelligenceServiceClient();

// --- Middleware ---
app.use(cors({
  origin: '*',
  credentials: true
}));
app.use(express.json());

// 1. Serwowanie plików statycznych (Vite build)
app.use(express.static(distPath));

// --- Multer (Konfiguracja dla plików do 50MB) ---
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: { fileSize: 50 * 1024 * 1024 }
});

// --- API: Upload ---
app.post('/api/upload', upload.single('teaser'), async (req: any, res: any) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file' });

    const { buffer, originalname, mimetype } = req.file;
    const destination = `teasers/${Date.now()}_${originalname}`;
    const file = bucket.file(destination);

    await file.save(buffer, { metadata: { contentType: mimetype } });

    const gcsUri = `gs://${bucket.name}/${destination}`;
    const key = datastore.key('teasers');

    await datastore.save({
      key,
      data: {
        name: originalname,
        status: 'processing',
        tags: [],
        gcsUri,
        createdAt: new Date().toISOString()
      }
    });

    const id = key.id || key.name;
    // @ts-ignore
    processVideo(gcsUri, id!.toString());

    res.status(200).json({ id, message: 'Processing started' });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// --- API: Get Teasers ---
app.get('/api/teasers', async (_req: any, res: any) => {
  try {
    const query = datastore.createQuery('teasers').order('createdAt', { descending: true });
    const [entities] = await datastore.runQuery(query);
    const teasers = entities.map(e => ({
      id: e[datastore.KEY].id || e[datastore.KEY].name,
      ...e
    }));
    res.json(teasers);
  } catch (error) {
    console.error('Get teasers error:', error);
    res.status(500).send(error);
  }
});

// --- Funkcja Video Intelligence (Background) ---
async function processVideo(gcsUri: string, docId: string) {
  try {
    const [operation] = await videoClient.annotateVideo({
      inputUri: gcsUri,
      features: ['LABEL_DETECTION' as any],
    });
    const [result] = await operation.promise();
    const tags = result.annotationResults?.[0].segmentLabelAnnotations?.map(l => l.entity!.description) || [];

    const key = datastore.key(['teasers', parseInt(docId)]);
    const [existing] = await datastore.get(key);
    await datastore.save({ key, data: { ...existing, tags, status: 'processed' } });
  } catch (e) {
    console.error('Video processing error:', e);
  }
}

// --- Obsługa React Router (Wildcard) ---
/** * Używamy (.*) zamiast *, aby uniknąć błędu PathError w Express 5.x/Node 22
 * Ta ścieżka MUSI być na samym końcu.
 */
app.all("/{*splat}", (_req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Serving static files from: ${distPath}`);
});