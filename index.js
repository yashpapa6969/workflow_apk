const express = require('express');
const multer = require('multer');
const fs = require('fs').promises; // Use fs promises for async operations
const path = require('path');

const app = express();
app.use(express.json()); // bodyParser.json() is deprecated
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));
const UPLOADS_DIR = path.join(__dirname, 'uploads');

async function ensureDirectoryExists() {
    try {
        await fs.access(UPLOADS_DIR);
    } catch (error) {
        await fs.mkdir(UPLOADS_DIR, { recursive: true });
    }
}

ensureDirectoryExists();

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOADS_DIR),
    filename: (req, file, cb) => {
        const timestamp = Date.now();
        const filename = file.fieldname + '-' + timestamp + '.apk';
        cb(null, filename);
    }
});

const upload = multer({
    storage: storage,
    fileFilter: (req, file, cb) => {
        if (file.mimetype !== 'application/vnd.android.package-archive') {
            return cb(new Error('Invalid file type, only APKs are allowed!'), false);
        }
        cb(null, true);
    },
    limits: { fileSize: 10 * 1024 * 1024*1024 } // 10 MB limit
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post('/upload-apk', upload.single('apk'), (req, res) => {
    if (!req.file) return res.status(400).send('No file uploaded.');
    res.status(201).send('APK uploaded successfully: ' + req.file.filename);
});

app.patch('/rename-apk', async (req, res) => {
    const { oldFilename, newFilename } = req.body;

    // Validate input filenames
    if (!oldFilename || !newFilename) {
        return res.status(400).send('Both old and new filenames are required.');
    }

    // Ensure new filename ends with '.apk'
    const sanitizedNewFilename = newFilename.trim().toLowerCase().endsWith('.apk')
        ? newFilename.trim()
        : newFilename.trim() + '.apk';

    try {
        const oldPath = path.join(UPLOADS_DIR, oldFilename);
        const newPath = path.join(UPLOADS_DIR, sanitizedNewFilename);

        // Rename the file in the filesystem
        await fs.rename(oldPath, newPath);
        res.send('APK renamed successfully to ' + sanitizedNewFilename);
    } catch (error) {
        if (error.code === 'ENOENT') {
            res.status(404).send('Original APK file not found.');
        } else {
            res.status(500).send('Error renaming APK: ' + error.message);
        }
    }
});

app.delete('/delete-apk', async (req, res) => {
    const { filename } = req.body;
    try {
        const filePath = path.join(UPLOADS_DIR, filename);
        await fs.unlink(filePath);
        res.send('APK deleted successfully');
    } catch (error) {
        res.status(500).send('Error deleting APK: ' + error.message);
    }
});
app.get('/apks', async (req, res) => {
    try {
        const files = await fs.readdir(UPLOADS_DIR);
        const apks = files.filter(file => file.endsWith('.apk')).map(file => {
            return {
                filename: file,
                url: `/uploads/${file}`
            };
        });
        res.status(200).json(apks);
    } catch (error) {
        console.error("Failed to list APKs:", error);
        res.status(500).send('Error listing APK files: ' + error.message);
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
