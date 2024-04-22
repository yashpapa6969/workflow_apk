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


const METADATA_FILE = path.join(__dirname, 'metadata.json');

// Function to read metadata from the JSON file
async function readMetadata() {
    try {
        const data = await fs.readFile(METADATA_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error("Failed to read metadata:", error);
        // Depending on your requirements, you might want to handle this differently
        // For example, you could initialize an empty metadata file here if it doesn't exist
        throw error; // Rethrow the error after logging it or handling recovery
    }
}

// Function to write metadata to the JSON file
async function writeMetadata(metadata) {
    try {
        const data = JSON.stringify(metadata, null, 2); // Pretty print the JSON
        await fs.writeFile(METADATA_FILE, data, 'utf8');
    } catch (error) {
        console.error("Failed to write metadata:", error);
        throw error; // Rethrow the error after logging it or handling recovery
    }
}

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

    // Validate input filenames
    if (!oldFilename || !newFilename) {
        return res.status(400).send('Both old and new filenames are required.');
    }

    // Ensure new filename ends with '.apk'
    const sanitizedNewFilename = newFilename.trim().toLowerCase().endsWith('.apk')
        ? newFilename.trim()
        : newFilename.trim() + '.apk';

    try {
        // Construct file paths
        const oldPath = path.join(UPLOADS_DIR, oldFilename);
        const newPath = path.join(UPLOADS_DIR, sanitizedNewFilename);

        // Check if the new file name already exists
        if (await fs.access(newPath, fs.constants.F_OK).then(() => true).catch(() => false)) {
            return res.status(409).send('A file with the new filename already exists.');
        }

        // Rename the file in the filesystem
        await fs.rename(oldPath, newPath);

        // Update the metadata
        const metadata = await readMetadata();
        const apkIndex = metadata.findIndex(apk => apk.filename === oldFilename);
        if (apkIndex !== -1) {
            metadata[apkIndex].filename = sanitizedNewFilename;
            await writeMetadata(metadata);
            res.send('APK renamed successfully to ' + sanitizedNewFilename);
        } else {
            res.status(404).send('APK not found');
        }
    } catch (error) {
        if (error.code === 'ENOENT') {
            res.status(404).send('Original APK file not found.');
        } else {
            res.status(500).send('Error renaming APK: ' + error.message);
        }
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
