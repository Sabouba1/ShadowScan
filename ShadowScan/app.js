class ImageGuardPro {
    constructor() {
        this.images = [];
        this.currentView = 'grid';
        this.currentFilter = 'all';
        this.initializeEventListeners();
    }

    initializeEventListeners() {
        const dropZone = document.getElementById('dropZone');
        const fileInput = document.getElementById('fileInput');

        // Upload events
        dropZone.addEventListener('click', () => fileInput.click());
        dropZone.addEventListener('dragover', this.handleDragOver.bind(this));
        dropZone.addEventListener('dragleave', this.handleDragLeave.bind(this));
        dropZone.addEventListener('drop', this.handleDrop.bind(this));
        fileInput.addEventListener('change', this.handleFileSelect.bind(this));

        // View controls
        document.querySelectorAll('.view-btn').forEach(btn => {
            btn.addEventListener('click', this.handleViewChange.bind(this));
        });

        document.getElementById('riskFilter').addEventListener('change', this.handleFilterChange.bind(this));

        // Export buttons
        document.getElementById('exportCSV').addEventListener('click', this.exportCSV.bind(this));
        document.getElementById('exportPDF').addEventListener('click', this.exportPDF.bind(this));
    }

    handleDragOver(e) {
        e.preventDefault();
        e.currentTarget.classList.add('dragover');
    }

    handleDragLeave(e) {
        e.preventDefault();
        e.currentTarget.classList.remove('dragover');
    }

    handleDrop(e) {
        e.preventDefault();
        e.currentTarget.classList.remove('dragover');
        const files = Array.from(e.dataTransfer.files).filter(file => file.type.startsWith('image/'));
        if (files.length > 0) {
            this.processFiles(files);
        }
    }

    handleFileSelect(e) {
        const files = Array.from(e.target.files);
        if (files.length > 0) {
            this.processFiles(files);
        }
    }

    async processFiles(files) {
        document.getElementById('loading').classList.remove('hidden');
        document.getElementById('statsBar').classList.add('hidden');
        document.getElementById('controls').classList.add('hidden');

        this.images = [];
        const gallery = document.getElementById('gallery');
        gallery.innerHTML = '';

        for (const file of files) {
            await this.analyzeImage(file);
        }

        this.updateStats();
        this.renderImages();

        document.getElementById('loading').classList.add('hidden');
        document.getElementById('statsBar').classList.remove('hidden');
        document.getElementById('controls').classList.remove('hidden');
    }
    analyzeImage(file) {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    EXIF.getData(file, () => {
                        const metadata = EXIF.getAllTags(file);
                        const analysis = this.analyzeMetadata(metadata, file);

                        this.images.push({
                            file,
                            src: e.target.result,
                            metadata,
                            analysis,
                            dimensions: { width: img.width, height: img.height }
                        });

                        resolve();
                    });
                };
                img.src = e.target.result;
            };
            reader.readAsDataURL(file);
        });
    }

    analyzeMetadata(metadata, file) {
        const risks = [];
        let score = 100;
        let riskLevel = 'low';

        const camera = {
            make: metadata.Make || 'Unknown',
            model: metadata.Model || 'Unknown',
            software: metadata.Software || 'N/A'
        };

        const dateTime = metadata.DateTimeOriginal || metadata.DateTime || null;
        if (dateTime) {
            risks.push('Creation timestamp available');
            score -= 10;
        }

        let location = null;
        if (metadata.GPSLatitude && metadata.GPSLongitude) {
            const lat = this.convertGPSToDecimal(metadata.GPSLatitude, metadata.GPSLatitudeRef);
            const lon = this.convertGPSToDecimal(metadata.GPSLongitude, metadata.GPSLongitudeRef);
            location = { lat, lon };
            risks.push('GPS coordinates embedded');
            score -= 30;
        }

        if (camera.make !== 'Unknown' || camera.model !== 'Unknown') {
            risks.push('Device identification possible');
            score -= 15;
        }

        if (metadata.LensModel) {
            risks.push('Lens information available');
            score -= 5;
        }

        if (camera.software !== 'N/A') {
            risks.push('Software information exposed');
            score -= 10;
        }

        if (metadata.ISOSpeedRatings) {
            risks.push('Camera settings revealed');
            score -= 5;
        }

        if (score >= 80) riskLevel = 'low';
        else if (score >= 50) riskLevel = 'medium';
        else riskLevel = 'high';

        return {
            score: Math.max(score, 0),
            riskLevel,
            risks,
            camera,
            dateTime,
            location,
            technicalData: {
                iso: metadata.ISOSpeedRatings || 'N/A',
                aperture: metadata.FNumber || metadata.ApertureValue || 'N/A',
                exposure: metadata.ExposureTime || metadata.ShutterSpeedValue || 'N/A',
                flash: metadata.Flash ? 'Used' : 'Not used',
                lens: metadata.LensModel || 'N/A'
            }
        };
    }

    convertGPSToDecimal(coord, ref) {
        if (!Array.isArray(coord) || coord.length !== 3) return 0;
        let decimal = coord[0] + coord[1] / 60 + coord[2] / 3600;
        if (ref === 'S' || ref === 'W') decimal *= -1;
        return parseFloat(decimal.toFixed(6));
    }
    updateStats() {
        const totalFiles = this.images.length;
        const avgScore = Math.round(this.images.reduce((sum, img) => sum + img.analysis.score, 0) / totalFiles);
        const highRisk = this.images.filter(img => img.analysis.riskLevel === 'high').length;
        const withGPS = this.images.filter(img => img.analysis.location).length;

        document.getElementById('totalFiles').textContent = totalFiles;
        document.getElementById('avgScore').textContent = avgScore;
        document.getElementById('highRisk').textContent = highRisk;
        document.getElementById('withGPS').textContent = withGPS;
    }

    renderImages() {
        const gallery = document.getElementById('gallery');
        const filteredImages = this.getFilteredImages();

        gallery.innerHTML = '';

        filteredImages.forEach((imageData, index) => {
            const card = this.createImageCard(imageData, index);
            gallery.appendChild(card);
        });
    }

    getFilteredImages() {
        if (this.currentFilter === 'all') return this.images;
        return this.images.filter(img => img.analysis.riskLevel === this.currentFilter);
    }

    createImageCard(imageData, index) {
        const { file, src, analysis, metadata, dimensions } = imageData;

        const card = document.createElement('div');
        card.className = 'image-card';

        card.innerHTML = `
            <div class="image-header">
                <img src="${src}" alt="${file.name}" class="image-preview">
                <div class="risk-badge risk-${analysis.riskLevel}">
                    ${analysis.riskLevel.toUpperCase()} RISK
                </div>
            </div>
            <div class="image-body">
                <div class="image-title">
                    <i class="fas fa-image"></i>
                    <span>${file.name}</span>
                </div>

                <div class="metadata-summary">
                    <div class="meta-row">
                        <span class="meta-label">File Size:</span>
                        <span class="meta-value">${this.formatFileSize(file.size)}</span>
                    </div>
                    <div class="meta-row">
                        <span class="meta-label">Dimensions:</span>
                        <span class="meta-value">${dimensions.width} × ${dimensions.height}</span>
                    </div>
                    <div class="meta-row">
                        <span class="meta-label">Camera:</span>
                        <span class="meta-value">${analysis.camera.make} ${analysis.camera.model}</span>
                    </div>
                    <div class="meta-row">
                        <span class="meta-label">Date Taken:</span>
                        <span class="meta-value">${analysis.dateTime || 'Not available'}</span>
                    </div>
                </div>

                <div class="privacy-score">
                    <div class="score-circle" style="background: ${this.getScoreColor(analysis.score)}">
                        ${analysis.score}
                    </div>
                    <div>
                        <strong>Privacy Score</strong><br>
                        <small>${analysis.risks.length} privacy risks detected</small>
                    </div>
                </div>

                ${analysis.location ? this.createLocationSection(analysis.location, index) : ''}

                <div class="risks-section">
                    <h4><i class="fas fa-exclamation-triangle"></i> Detected Risks:</h4>
                    <ul style="margin: 0.5rem 0; padding-left: 1.5rem;">
                        ${analysis.risks.map(risk => `<li>${risk}</li>`).join('')}
                    </ul>
                </div>

                <div class="action-buttons">
                    <button class="btn btn-primary" onclick="app.cleanImage(${index})">
                        <i class="fas fa-shield-alt"></i> Clean & Download
                    </button>
                    <button class="btn btn-secondary" onclick="app.toggleRawMetadata(${index})">
                        <i class="fas fa-code"></i> View Raw Data
                    </button>
                </div>

                <div class="toggle-section">
                    <div class="raw-metadata hidden" id="raw-${index}">
                        <pre>${JSON.stringify(metadata, null, 2)}</pre>
                    </div>
                </div>
            </div>
        `;

        return card;
    }
    createLocationSection(location, index) {
        return `
            <div class="location-section">
                <div class="location-header">
                    <i class="fas fa-map-marker-alt"></i>
                    <strong>GPS Location Detected</strong>
                </div>
                <p>Coordinates: ${location.lat}, ${location.lon}</p>
                <a href="https://maps.google.com/?q=${location.lat},${location.lon}" target="_blank" 
                   style="color: var(--primary); text-decoration: none;">
                    <i class="fas fa-external-link-alt"></i> View on Google Maps
                </a>
                <div class="map-container" id="map-${index}"></div>
            </div>
        `;
    }

    getScoreColor(score) {
        if (score >= 80) return 'linear-gradient(135deg, #059669, #047857)';
        if (score >= 50) return 'linear-gradient(135deg, #d97706, #b45309)';
        return 'linear-gradient(135deg, #dc2626, #b91c1c)';
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    handleViewChange(e) {
        const view = e.currentTarget.dataset.view;
        this.currentView = view;

        document.querySelectorAll('.view-btn').forEach(btn => btn.classList.remove('active'));
        e.currentTarget.classList.add('active');

        const gallery = document.getElementById('gallery');
        gallery.className = `gallery ${view}-view`;
    }

    handleFilterChange(e) {
        this.currentFilter = e.target.value;
        this.renderImages();
    }

    toggleRawMetadata(index) {
        const rawDiv = document.getElementById(`raw-${index}`);
        rawDiv.classList.toggle('hidden');
    }

    cleanImage(index) {
        const imageData = this.images[index];
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const img = new Image();

        img.onload = function () {
            canvas.width = img.width;
            canvas.height = img.height;

            ctx.drawImage(img, 0, 0);

            canvas.toBlob(function (blob) {
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `cleaned_${imageData.file.name}`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            }, 'image/jpeg', 0.95);
        };

        img.src = imageData.src;
    }
    exportCSV() {
        const headers = [
            'Filename', 'Privacy Score', 'Risk Level', 'File Size', 'Dimensions',
            'Camera Make', 'Camera Model', 'Date Taken', 'GPS Coordinates',
            'ISO', 'Aperture', 'Exposure', 'Flash', 'Lens', 'Risks Count', 'Risk Details'
        ];

        const rows = this.images.map(img => [
            img.file.name,
            img.analysis.score,
            img.analysis.riskLevel,
            this.formatFileSize(img.file.size),
            `${img.dimensions.width}x${img.dimensions.height}`,
            img.analysis.camera.make,
            img.analysis.camera.model,
            img.analysis.dateTime || 'N/A',
            img.analysis.location ? `${img.analysis.location.lat}, ${img.analysis.location.lon}` : 'N/A',
            img.analysis.technicalData.iso,
            img.analysis.technicalData.aperture,
            img.analysis.technicalData.exposure,
            img.analysis.technicalData.flash,
            img.analysis.technicalData.lens,
            img.analysis.risks.length,
            img.analysis.risks.join('; ')
        ]);

        const csvContent = [headers, ...rows]
            .map(row => row.map(field => `"${field}"`).join(','))
            .join('\n');

        this.downloadFile(csvContent, 'image-metadata-analysis.csv', 'text/csv');
    }

    exportPDF() {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();

        doc.setFontSize(24);
        doc.setTextColor(37, 99, 235);
        doc.text('Image MetaData Analayzer', 20, 30);
        doc.setFontSize(18);
        doc.text('Metadata Analysis Report', 20, 45);

        doc.setFontSize(12);
        doc.setTextColor(100, 116, 139);
        doc.text(`Generated: ${new Date().toLocaleString()}`, 20, 60);
        doc.text(`Total Images Analyzed: ${this.images.length}`, 20, 70);

        doc.setFontSize(16);
        doc.setTextColor(30, 41, 59);
        doc.text('Summary Statistics', 20, 90);

        const totalFiles = this.images.length;
        const avgScore = Math.round(this.images.reduce((sum, img) => sum + img.analysis.score, 0) / totalFiles);
        const highRisk = this.images.filter(img => img.analysis.riskLevel === 'high').length;
        const mediumRisk = this.images.filter(img => img.analysis.riskLevel === 'medium').length;
        const lowRisk = this.images.filter(img => img.analysis.riskLevel === 'low').length;
        const withGPS = this.images.filter(img => img.analysis.location).length;

        doc.setFontSize(12);
        doc.text(`• Average Privacy Score: ${avgScore}/100`, 25, 105);
        doc.text(`• High Risk Images: ${highRisk} (${Math.round(highRisk / totalFiles * 100)}%)`, 25, 115);
        doc.text(`• Medium Risk Images: ${mediumRisk} (${Math.round(mediumRisk / totalFiles * 100)}%)`, 25, 125);
        doc.text(`• Low Risk Images: ${lowRisk} (${Math.round(lowRisk / totalFiles * 100)}%)`, 25, 135);
        doc.text(`• Images with GPS Data: ${withGPS} (${Math.round(withGPS / totalFiles * 100)}%)`, 25, 145);

        let yPos = 165;
        this.images.forEach((img, index) => {
            if (yPos > 250) {
                doc.addPage();
                yPos = 20;
            }

            doc.setFontSize(14);
            doc.setTextColor(30, 41, 59);
            doc.text(`${index + 1}. ${img.file.name}`, 20, yPos);
            yPos += 10;

            doc.setFontSize(10);
            doc.setTextColor(100, 116, 139);
            doc.text(`Privacy Score: ${img.analysis.score}/100 (${img.analysis.riskLevel.toUpperCase()} RISK)`, 25, yPos);
            yPos += 8;
            doc.text(`Camera: ${img.analysis.camera.make} ${img.analysis.camera.model}`, 25, yPos);
            yPos += 8;
            doc.text(`Date: ${img.analysis.dateTime || 'N/A'}`, 25, yPos);
            yPos += 8;

            if (img.analysis.location) {
                doc.text(`GPS: ${img.analysis.location.lat}, ${img.analysis.location.lon}`, 25, yPos);
                yPos += 8;
            }

            doc.text(`Risks: ${img.analysis.risks.join(', ')}`, 25, yPos);
            yPos += 15;
        });

        doc.save('Image MetaData Analayzer.pdf');
    }

    downloadFile(content, filename, type) {
        const blob = new Blob([content], { type });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
}

// Initialize the application
const app = new ImageGuardPro();

// Initialize maps after images are rendered
document.addEventListener('DOMContentLoaded', function () {
    const observer = new MutationObserver(function (mutations) {
        mutations.forEach(function (mutation) {
            mutation.addedNodes.forEach(function (node) {
                if (node.nodeType === 1 && node.classList && node.classList.contains('image-card')) {
                    const mapContainers = node.querySelectorAll('.map-container');
                    mapContainers.forEach(container => {
                        setTimeout(() => {
                            const mapId = container.id;
                            const index = mapId.split('-')[1];
                            const imageData = app.images[index];

                            if (imageData && imageData.analysis.location) {
                                const { lat, lon } = imageData.analysis.location;
                                const map = L.map(mapId).setView([lat, lon], 13);

                                L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                                    attribution: '© OpenStreetMap contributors'
                                }).addTo(map);

                                L.marker([lat, lon])
                                    .addTo(map)
                                    .bindPopup('Photo Location')
                                    .openPopup();
                            }
                        }, 100);
                    });
                }
            });
        });
    });

    observer.observe(document.getElementById('gallery'), { childList: true });
});
