require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '10mb' })); // Para imágenes en base64


// --- Modelo de Imagen ---
const imageSchema = new mongoose.Schema({
  imageData: String, // base64
  description: String,
  status: String,
  createdAt: { type: Date, default: Date.now }
});
const Image = mongoose.model('Image', imageSchema);

// --- Modelo de Sesión ---
const sessionSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  images: [imageSchema],
  createdAt: { type: Date, default: Date.now }
});
const Session = mongoose.model('Session', sessionSchema);

// --- Endpoints ---

// Obtener todas las imágenes (colección suelta)
app.get('/images', async (req, res) => {
  const images = await Image.find().sort({ createdAt: 1 });
  res.json(images);
});

// --- Endpoints para sesiones ---
// Listar todas las sesiones (solo nombres)
app.get('/sessions', async (req, res) => {
  const sessions = await Session.find({}, 'name').sort({ createdAt: -1 });
  res.json(sessions);
});

// Guardar una nueva sesión
app.post('/session', async (req, res) => {
  const { name, images } = req.body;
  if (!name || !images) return res.status(400).json({ error: 'Faltan datos' });
  // Si ya existe, reemplazar
  let session = await Session.findOneAndUpdate(
    { name },
    { images, createdAt: new Date() },
    { new: true, upsert: true }
  );
  res.json(session);
});

// Obtener una sesión por nombre
app.get('/session/:name', async (req, res) => {
  const session = await Session.findOne({ name: req.params.name });
  if (!session) return res.status(404).json({ error: 'Sesión no encontrada' });
  res.json(session);
});

// Eliminar una sesión por nombre
app.delete('/session/:name', async (req, res) => {
  await Session.findOneAndDelete({ name: req.params.name });
  res.json({ ok: true });
});

// Eliminar todas las sesiones
app.delete('/sessions', async (req, res) => {
  await Session.deleteMany({});
  res.json({ ok: true });
});

app.post('/upload', async (req, res) => {
  const { imageData, description, status } = req.body;
  const img = new Image({ imageData, description, status });
  await img.save();
  res.json(img);
});

app.delete('/image/:id', async (req, res) => {
  await Image.findByIdAndDelete(req.params.id);
  res.json({ ok: true });
});

app.put('/image/:id', async (req, res) => {
  const { description, status } = req.body;
  const img = await Image.findByIdAndUpdate(
    req.params.id,
    { description, status },
    { new: true }
  );
  res.json(img);
});

// --- Conexión a MongoDB Atlas ---
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => {
  console.log('Conectado a MongoDB Atlas');
  app.listen(PORT, () => console.log(`Servidor backend escuchando en puerto ${PORT}`));
}).catch(err => {
  console.error('Error de conexión a MongoDB:', err);
});
