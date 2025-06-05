// Backend principal para la app
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');

const app = express();
const PORT = process.env.PORT || 3001;

// Middlewares
app.use(cors());
app.use(bodyParser.json({ limit: '10mb' })); // Permitir imágenes grandes

// MongoDB connection
const mongoUri = process.env.MONGODB_URI || 'mongodb+srv://<usuario>:<password>@<cluster>.mongodb.net/<dbname>?retryWrites=true&w=majority';
mongoose.connect(mongoUri, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB connection error:', err));

// Mongoose schema
const ImageSchema = new mongoose.Schema({
  imageData: String, // base64
  description: String,
  status: String,
  createdAt: { type: Date, default: Date.now }
});
const Image = mongoose.model('Image', ImageSchema);

// --- Session schema ---
const SessionSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  images: [
    {
      imageData: String,
      description: String,
      status: String,
      createdAt: { type: Date, default: Date.now }
    }
  ],
  createdAt: { type: Date, default: Date.now }
});
const Session = mongoose.model('Session', SessionSchema);

// API routes
app.get('/images', async (req, res) => {
  const images = await Image.find().sort({ createdAt: -1 });
  res.json(images);
});

app.post('/upload', async (req, res) => {
  const { imageData, description, status } = req.body;
  if (!imageData) return res.status(400).json({ error: 'No image data provided' });
  const image = new Image({ imageData, description, status });
  await image.save();
  res.json(image);
});

app.put('/image/:id', async (req, res) => {
  const { description, status } = req.body;
  const image = await Image.findByIdAndUpdate(req.params.id, { description, status }, { new: true });
  res.json(image);
});

app.delete('/image/:id', async (req, res) => {
  await Image.findByIdAndDelete(req.params.id);
  res.json({ success: true });
});

// --- Session endpoints ---
// Guardar una sesión completa
app.post('/session', async (req, res) => {
  const { name, images } = req.body;
  if (!name || !Array.isArray(images)) {
    return res.status(400).json({ error: 'Name and images are required' });
  }
  // Si ya existe, reemplazar
  let session = await Session.findOneAndUpdate(
    { name },
    { images, createdAt: new Date() },
    { new: true, upsert: true }
  );
  res.json(session);
});

// Listar sesiones
app.get('/sessions', async (req, res) => {
  const sessions = await Session.find({}, 'name createdAt');
  res.json(sessions);
});

// Cargar una sesión específica
app.get('/session/:id', async (req, res) => {
  const session = await Session.findOne({ name: req.params.id });
  if (!session) return res.status(404).json({ error: 'Session not found' });
  res.json(session);
});

// Borrar una sesión específica
app.delete('/session/:id', async (req, res) => {
  await Session.deleteOne({ name: req.params.id });
  res.json({ success: true });
});

// Limpiar todas las sesiones
app.delete('/sessions', async (req, res) => {
  await Session.deleteMany({});
  res.json({ success: true });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
