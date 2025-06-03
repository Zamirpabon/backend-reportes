// Backend principal para la app
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;

// Middlewares
app.use(cors());
app.use(bodyParser.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// MongoDB connection
const mongoUri = process.env.MONGODB_URI || 'mongodb+srv://<usuario>:<password>@<cluster>.mongodb.net/<dbname>?retryWrites=true&w=majority';
mongoose.connect(mongoUri, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB connection error:', err));

// Mongoose schema
const ImageSchema = new mongoose.Schema({
  filename: String,
  url: String,
  description: String,
  status: String,
  createdAt: { type: Date, default: Date.now }
});
const Image = mongoose.model('Image', ImageSchema);

// Multer config
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/');
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + '-' + file.originalname);
  }
});
const upload = multer({ storage: storage });

// API routes
app.get('/images', async (req, res) => {
  const images = await Image.find().sort({ createdAt: -1 });
  res.json(images);
});

app.post('/upload', upload.single('image'), async (req, res) => {
  const { description, status } = req.body;
  const file = req.file;
  if (!file) return res.status(400).json({ error: 'No file uploaded' });
  const url = `/uploads/${file.filename}`;
  const image = new Image({ filename: file.filename, url, description, status });
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

// Endpoint para generar Word (ya lo tienes, aquí solo referencia)
// app.get('/generate-word', ...)

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
