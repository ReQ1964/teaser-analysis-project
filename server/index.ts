import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import multer from 'multer'
import admin from 'firebase-admin'
import { VideoIntelligenceServiceClient } from '@google-cloud/video-intelligence'
import fs from 'fs'

dotenv.config()

const app = express()
const port = process.env.PORT || 3000

const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || './server/service-account.json'

if (fs.existsSync(serviceAccountPath)) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccountPath),
    storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
    databaseURL: process.env.FIREBASE_DATABASE_URL
  })
} else {
  console.warn('Service account file not found. Firebase Admin not initialized. Use placeholders.')
}

const db = admin.apps.length ? admin.firestore() : null
const bucket = admin.apps.length ? admin.storage().bucket() : null
const videoClient = new VideoIntelligenceServiceClient()

app.use(cors({
  origin: process.env.ALLOWED_ORIGIN || '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}))
app.use(express.json())

const upload = multer({ dest: 'uploads/' })

const __dirname = path.resolve()
app.use(express.static(path.join(__dirname, 'dist')))

app.post('/api/upload', upload.single('teaser'), async (req: any, res: any) => {
  try {
    if (!req.file || !db || !bucket) {
      return res.status(400).json({ error: 'Missing file or Firebase not configured' })
    }

    const { path: filePath, originalname } = req.file
    const destination = `teasers/${Date.now()}_${originalname}`

    await bucket.upload(filePath, {
      destination,
      metadata: { contentType: req.file.mimetype }
    })

    const gcsUri = `gs://${bucket.name}/${destination}`

    const teaserRef = await db.collection('teasers').add({
      name: originalname,
      status: 'processing',
      tags: [],
      gcsUri,
      createdAt: new Date().toISOString()
    })

    processVideo(gcsUri, teaserRef.id)

    fs.unlinkSync(filePath)

    res.status(200).json({ id: teaserRef.id, message: 'Processing started' })
  } catch (error) {
    console.error('Upload error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// 2. Get Teasers
app.get('/api/teasers', async (req: any, res: any) => {
  try {
    if (!db) {
      return res.json([
        { id: '1', name: 'Cool Teaser.mp4', status: 'processed', tags: ['Nature', 'Sky'], createdAt: new Date().toISOString() },
        { id: '2', name: 'Product Demo.mov', status: 'processing', tags: [], createdAt: new Date().toISOString() }
      ])
    }

    const snapshot = await db.collection('teasers').orderBy('createdAt', 'desc').get()
    const teasers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
    res.json(teasers)
  } catch (error) {
    console.error('Fetch error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// --- Helper Functions ---

async function processVideo(gcsUri: string, docId: string) {
  try {
    const request = {
      inputUri: gcsUri,
      features: ['LABEL_DETECTION' as any],
    }

    const [operation] = await videoClient.annotateVideo(request)
    console.log(`Waiting for operation to complete on ${gcsUri}...`)

    const [operationResult] = await operation.promise()
    const annotations = operationResult.annotationResults![0]
    const labels = annotations.segmentLabelAnnotations || []
    
    // Extract tag names
    const tags = labels.map(label => label.entity!.description)

    // Update Firestore
    if (db) {
      await db.collection('teasers').doc(docId).update({
        tags,
        status: 'processed'
      })
    }
    console.log(`Processing complete for ${docId}`)
  } catch (error) {
    console.error('Video processing error:', error)
    if (db) {
      await db.collection('teasers').doc(docId).update({
        status: 'error'
      })
    }
  }
}

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'))
})

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`)
})
