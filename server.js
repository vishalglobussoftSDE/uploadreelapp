import express from 'express';
import dotenv from 'dotenv';
import multer from 'multer';
import { S3Client, PutObjectCommand, ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';
import stream from 'stream';
import { promisify } from 'util';

dotenv.config();
const app = express();
const port = process.env.PORT || 5000;

// Multer memory storage
const upload = multer({ storage: multer.memoryStorage() }); 

// Wasabi S3 Client
const s3 = new S3Client({
  endpoint: process.env.WASABI_ENDPOINT,
  region: process.env.WASABI_REGION,
  credentials: {
    accessKeyId: process.env.WASABI_ACCESS_KEY,
    secretAccessKey: process.env.WASABI_SECRET_KEY,
  },
});

app.post('/upload', upload.single('video'), async (req, res) => {
  const file = req.file;
  if (!file) return res.status(400).json({ error: 'No file uploaded' });
  
  const key = file.originalname; 

  try {
    await s3.send(new PutObjectCommand({
      Bucket: process.env.WASABI_BUCKET,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype,
    }));

    res.json({
      message: 'Upload successful',
      file: {
        name: file.originalname,
        key,
        // url: `http://localhost:${port}/stream?key=${encodeURIComponent(key)}`
      }
    });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: 'Upload failed', details: err.message });
  }
});

// 📁 List Files API: GET /files
app.get('/files', async (req, res) => {
  try {
    const data = await s3.send(new ListObjectsV2Command({
      Bucket: process.env.WASABI_BUCKET,
    }));

    const files = (data.Contents || []).map(file => ({
      name: file.Key,
      key: file.Key,
      url: "" // get signed url
    }));

    res.json({ files });
  } catch (err) {
    console.error('List error:', err);
    res.status(500).json({ error: 'Failed to list files', details: err.message });
  }
});

// 🎥 Stream API: GET /stream?key=filename.mp4
app.get('/stream', async (req, res) => {
  const key = req.query.key;
  if (!key) return res.status(400).json({ error: 'Missing key' });

  try {
    const data = await s3.send(new GetObjectCommand({
      Bucket: process.env.WASABI_BUCKET,
      Key: key,
    }));

    res.set({
      'Content-Type': data.ContentType || 'video/mp4',
      'Content-Length': data.ContentLength,
      'Accept-Ranges': 'bytes',
    });

    const pipeline = promisify(stream.pipeline);
    await pipeline(data.Body, res);
  } catch (err) {
    console.error('Stream error:', err);
    res.status(500).json({ error: 'Failed to stream video', details: err.message });
  }
});

// 🚀 Start Server
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
