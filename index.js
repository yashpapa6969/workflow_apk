const express = require('express');
const multer = require('multer');
const fs = require('fs').promises; // Use fs promises for async operations
const path = require('path');

const app = express();
app.use(express.json()); // bodyParser.json() is deprecated
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));
const UPLOADS_DIR = path.join(__dirname, 'uploads');

const APK_DIRECTORY = './uploads';
const METADATA_FILE = './metadata.json';

async function ensureDirectoryExists() {
    try {
        await fs.access(APK_DIRECTORY);
    } catch (error) {
        await fs.mkdir(APK_DIRECTORY, { recursive: true });
    }
}

async function ensureMetadataExists() {
    try {
        await fs.access(METADATA_FILE);
    } catch (error) {
        await fs.writeFile(METADATA_FILE, JSON.stringify([]), 'utf8');
    }
}

ensureDirectoryExists();
ensureMetadataExists();

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, APK_DIRECTORY),
    filename: (req, file, cb) => {
        const timestamp = Date.now();
        const filename = file.fieldname + '-' + timestamp + '.apk';
        cb(null, filename);
    }
});

const upload = multer({
    storage: storage,
    fileFilter: (req, file, cb) => {
        console.log("Received file with MIME type:", file.mimetype); // Add this line
        // if (file.mimetype !== 'application/vnd.android.package-archive') {
        //     return cb(new Error('Invalid file type, only APKs are allowed!'), false);
        // }
        cb(null, true);
    },
    limits: { fileSize: 10 * 1024 * 1024*1024 } // 10 MB limit
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post('/upload-apk', upload.single('apk'), async (req, res) => {
    if (!req.file) return res.status(400).send('No file uploaded.');

    const metadata = {
        filename: req.file.filename,
        uploadDate: new Date().toISOString()
    };

    try {
        const currentData = JSON.parse(await fs.readFile(METADATA_FILE, 'utf8'));
        currentData.push(metadata);
        await fs.writeFile(METADATA_FILE, JSON.stringify(currentData, null, 2), 'utf8');
        res.status(201).send('APK uploaded successfully: ' + req.file.filename);
    } catch (error) {
        res.status(500).send('Error saving file information: ' + error.message);
    }
});

app.get('/apks', async (req, res) => {
    try {
        const apks = JSON.parse(await fs.readFile(METADATA_FILE, 'utf8'));
        res.status(200).json(apks);
    } catch (error) {
        res.status(500).send('Error reading APK data: ' + error.message);
    }
});
app.patch('/rename-apk', async (req, res) => {
    const { oldFilename, newFilename } = req.body;
    try {
        // Rename the file in the filesystem
        const oldPath = path.join(UPLOADS_DIR, oldFilename);
        const newPath = path.join(UPLOADS_DIR, newFilename);

        await fs.rename(oldPath, newPath);
        // Update the metadata
        const metadata = await readMetadata();
        const apkIndex = metadata.findIndex(apk => apk.filename === oldFilename);
        if (apkIndex !== -1) {
            metadata[apkIndex].filename = newFilename;
            await writeMetadata(metadata);
            res.send('APK renamed successfully');
        } else {
            res.status(404).send('APK not found');
        }
    } catch (error) {
        res.status(500).send('Error renaming APK: ' + error.message);
    }
});

// API to delete an APK
app.delete('/delete-apk', async (req, res) => {
    const { filename } = req.body;
    try {
        // Delete the file from the filesystem
        const filePath = path.join(UPLOADS_DIR, filename);
        await fs.unlink(filePath);
        // Update the metadata
        const metadata = await readMetadata();
        const filteredMetadata = metadata.filter(apk => apk.filename !== filename);
        await writeMetadata(filteredMetadata);

        res.send('APK deleted successfully');
    } catch (error) {
        res.status(500).send('Error deleting APK: ' + error.message);
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
