import { 
    downloadBlob, readFileAsDataURL, readFileAsArrayBuffer, 
    showNotification, escapeHtml, getFileType, formatFileSize,
    createImageFromDataUrl, dataUrlToBlob
} from './utils.js';

let files = [];

export function initConverter() {
    console.log('Converter module initializing');
    const container = document.getElementById('convert');
    if (!container) {
        console.error('Container #convert not found');
        return;
    }
    
    container.innerHTML = `
        <div class="tool-card">
            <h3><i class="fas fa-exchange-alt"></i> Конвертация файлов</h3>
            
            <div class="drop-zone" id="convertDropZone">
                <i class="fas fa-cloud-upload-alt"></i>
                <p>Перетащите файлы сюда или <strong>кликните для выбора</strong></p>
                <p style="font-size:0.85rem; color:var(--text-muted); margin-top:8px;">
                    Поддерживаются: PNG, JPEG, GIF, WEBP, DOC, DOCX, XLS, XLSX, PDF
                </p>
                <input type="file" id="convertInput" multiple 
                    accept=".png,.jpg,.jpeg,.gif,.webp,.doc,.docx,.xls,.xlsx,.pdf" 
                    style="display:none;">
            </div>
            
            <div id="convertFileList" class="file-list"></div>
            
            <div class="options-panel">
                <label>
                    <i class="fas fa-cog"></i> Режим:
                    <select id="convertMode">
                        <option value="auto">Авто (определять по файлу)</option>
                        <option value="toPdf">В PDF</option>
                        <option value="fromPdf">Из PDF</option>
                    </select>
                </label>
                <label style="margin-left:auto;">
                    <i class="fas fa-file-export"></i> Выходной формат:
                    <select id="outputFormat">
                        <option value="pdf">PDF</option>
                        <option value="png">PNG</option>
                        <option value="docx">DOCX</option>
                    </select>
                </label>
            </div>
            
            <div class="btn-group">
                <button class="btn btn-primary" id="convertBtn">
                    <i class="fas fa-exchange-alt"></i> Конвертировать
                </button>
                <button class="btn btn-secondary" id="clearConvertBtn">
                    <i class="fas fa-trash"></i> Очистить
                </button>
            </div>
            
            <div id="convertStatus" class="status">
                <i class="fas fa-info-circle"></i> Добавьте файлы для конвертации
            </div>
        </div>
    `;

    const dropZone = document.getElementById('convertDropZone');
    const input = document.getElementById('convertInput');
    const fileList = document.getElementById('convertFileList');
    const convertBtn = document.getElementById('convertBtn');
    const clearBtn = document.getElementById('clearConvertBtn');
    const modeSelect = document.getElementById('convertMode');
    const formatSelect = document.getElementById('outputFormat');
    const statusEl = document.getElementById('convertStatus');

    if (!dropZone || !input || !fileList || !convertBtn || !clearBtn) {
        console.error('Converter elements not found');
        return;
    }

    console.log('Converter elements found');

    dropZone.addEventListener('click', () => input.click());
    dropZone.addEventListener('dragover', e => {
        e.preventDefault();
        dropZone.classList.add('dragover');
    });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
    dropZone.addEventListener('drop', e => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        console.log('Files dropped:', e.dataTransfer.files.length);
        handleFiles(e.dataTransfer.files);
    });

    input.addEventListener('change', e => {
        if (e.target.files.length) {
            console.log('Files selected:', e.target.files.length);
            handleFiles(e.target.files);
        }
        input.value = '';
    });

    async function handleFiles(fileList_) {
        console.log('Handling files:', fileList_.length);
        const newFiles = Array.from(fileList_).filter(f => {
            const type = getFileType(f.name);
            return ['image', 'document', 'pdf'].includes(type);
        });

        console.log('Filtered files:', newFiles.length);

        for (const file of newFiles) {
            const type = getFileType(file.name);
            try {
                const dataUrl = type === 'pdf' ? null : await readFileAsDataURL(file);
                const arrayBuffer = type === 'pdf' ? await readFileAsArrayBuffer(file) : null;
                files.push({
                    file,
                    name: file.name,
                    size: file.size,
                    type: type,
                    dataUrl: dataUrl,
                    arrayBuffer: arrayBuffer
                });
                console.log('File added:', file.name, type);
            } catch (e) {
                console.error('Error reading file:', file.name, e);
            }
        }

        renderFileList();
        updateStatus(`Добавлено ${newFiles.length} файлов`, 'info');
    }

    function renderFileList() {
        fileList.innerHTML = '';
        if (files.length === 0) {
            fileList.innerHTML = `
                <div style="text-align:center; color:var(--text-muted); padding:20px;">
                    <i class="fas fa-inbox" style="font-size:2rem; display:block; margin-bottom:8px;"></i>
                    Нет добавленных файлов
                </div>
            `;
            return;
        }

        files.forEach((f, index) => {
            const div = document.createElement('div');
            div.className = 'file-item';
            const iconMap = {
                image: 'fa-image',
                document: 'fa-file-word',
                pdf: 'fa-file-pdf'
            };
            div.innerHTML = `
                <span><i class="fas ${iconMap[f.type] || 'fa-file'}"></i></span>
                <span class="name">${escapeHtml(f.name)} (${formatFileSize(f.size)})</span>
                <span style="color:var(--text-muted); font-size:0.85rem; text-transform:uppercase;">${f.type}</span>
                <span class="remove" data-index="${index}"><i class="fas fa-times"></i></span>
            `;
            fileList.appendChild(div);
        });

        document.querySelectorAll('.remove').forEach(btn => {
            btn.addEventListener('click', e => {
                const idx = parseInt(e.currentTarget.dataset.index);
                files.splice(idx, 1);
                renderFileList();
                updateStatus('Файл удалён', 'info');
            });
        });
    }

    clearBtn.addEventListener('click', () => {
        files = [];
        renderFileList();
        updateStatus('Список очищен', 'info');
        showNotification('Список очищен', 'info');
    });

    convertBtn.addEventListener('click', async () => {
        console.log('Convert button clicked');
        if (files.length === 0) {
            showNotification('Добавьте хотя бы один файл', 'warning');
            return;
        }

        const mode = modeSelect.value;
        const output = formatSelect.value;

        let targetMode = mode;
        if (mode === 'auto') {
            const allPdf = files.every(f => f.type === 'pdf');
            targetMode = allPdf ? 'fromPdf' : 'toPdf';
        }

        console.log('Target mode:', targetMode);

        if (targetMode === 'toPdf') {
            await convertToPdf(output);
        } else {
            await convertFromPdf(output);
        }
    });

    async function convertToPdf(outputFormat) {
        console.log('Converting to PDF');
        try {
            updateStatus('Конвертация в PDF...', 'info');
            const { PDFDocument } = PDFLib;
            const pdfDoc = await PDFDocument.create();

            for (const f of files) {
                console.log('Processing file:', f.name, f.type);
                if (f.type === 'image') {
                    const img = await createImageFromDataUrl(f.dataUrl);
                    let imageEmbed;
                    const ext = f.name.split('.').pop().toLowerCase();
                    if (ext === 'png') {
                        imageEmbed = await pdfDoc.embedPng(f.dataUrl);
                    } else {
                        imageEmbed = await pdfDoc.embedJpg(f.dataUrl);
                    }
                    const page = pdfDoc.addPage([img.width, img.height]);
                    page.drawImage(imageEmbed, { x: 0, y: 0, width: img.width, height: img.height });
                } else if (f.type === 'document') {
                    const ext = f.name.split('.').pop().toLowerCase();
                    const page = pdfDoc.addPage([595, 842]);
                    const font = await pdfDoc.embedFont(PDFLib.StandardFonts.TimesRoman);
                    
                    try {
                        let text = '';
                        if (ext === 'docx') {
                            const result = await mammoth.convertToHtml({ arrayBuffer: await f.file.arrayBuffer() });
                            text = result.value.replace(/<[^>]*>/g, ' ').trim();
                        } else {
                            text = await f.file.text();
                        }
                        
                        const words = text.split(/\s+/);
                        let line = '';
                        let y = 800;
                        let fontSize = 12;
                        
                        for (const word of words) {
                            const testLine = line ? line + ' ' + word : word;
                            if (testLine.length > 80) {
                                if (line) {
                                    page.drawText(line, { x: 40, y, size: fontSize, font });
                                    y -= fontSize + 4;
                                }
                                line = word;
                            } else {
                                line = testLine;
                            }
                            if (y < 40) break;
                        }
                        if (line && y > 40) {
                            page.drawText(line, { x: 40, y, size: fontSize, font });
                        }
                    } catch (e) {
                        console.error('Document conversion error:', e);
                        page.drawText('Ошибка конвертации документа', {
                            x: 40, y: 800, size: 16, font,
                            color: { r: 1, g: 0, b: 0 }
                        });
                    }
                }
            }

            const pdfBytes = await pdfDoc.save();
            downloadBlob(new Blob([pdfBytes], { type: 'application/pdf' }), 'converted.pdf');
            updateStatus(`Конвертация завершена! ${files.length} файлов → PDF`, 'success');
            showNotification('PDF успешно создан!', 'success');
        } catch (error) {
            console.error('Convert error:', error);
            updateStatus('Ошибка: ' + error.message, 'error');
            showNotification('Ошибка конвертации: ' + error.message, 'error');
        }
    }

    async function convertFromPdf(outputFormat) {
        console.log('Converting from PDF');
        try {
            updateStatus('Конвертация из PDF...', 'info');
            
            const pdfFiles = files.filter(f => f.type === 'pdf');
            if (pdfFiles.length === 0) {
                showNotification('Нет PDF файлов для конвертации', 'warning');
                return;
            }

            if (outputFormat === 'png') {
                const pdfJsDoc = await pdfjsLib.getDocument({ data: pdfFiles[0].arrayBuffer }).promise;
                for (let i = 1; i <= pdfJsDoc.numPages; i++) {
                    const page = await pdfJsDoc.getPage(i);
                    const viewport = page.getViewport({ scale: 2 });
                    const canvas = document.createElement('canvas');
                    canvas.width = viewport.width;
                    canvas.height = viewport.height;
                    const ctx = canvas.getContext('2d');
                    await page.render({ canvasContext: ctx, viewport }).promise;
                    
                    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
                    downloadBlob(blob, `page-${i}.png`);
                }
                updateStatus(`Конвертация завершена! ${pdfJsDoc.numPages} страниц → PNG`, 'success');
                showNotification(`Создано ${pdfJsDoc.numPages} PNG изображений`, 'success');
            } else {
                const pdfJsDoc = await pdfjsLib.getDocument({ data: pdfFiles[0].arrayBuffer }).promise;
                const totalPages = pdfJsDoc.numPages;
                
                for (let i = 1; i <= totalPages; i++) {
                    const page = await pdfJsDoc.getPage(i);
                    const viewport = page.getViewport({ scale: 2 });
                    const canvas = document.createElement('canvas');
                    canvas.width = viewport.width;
                    canvas.height = viewport.height;
                    const ctx = canvas.getContext('2d');
                    await page.render({ canvasContext: ctx, viewport }).promise;
                    
                    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
                    const reader = new FileReader();
                    reader.onload = async function(e) {
                        const dataUrl = e.target.result;
                        const { PDFDocument } = PDFLib;
                        const pdfDoc = await PDFDocument.create();
                        const img = await pdfDoc.embedPng(dataUrl);
                        const pageDoc = pdfDoc.addPage([img.width, img.height]);
                        pageDoc.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
                        const pdfBytes = await pdfDoc.save();
                        downloadBlob(new Blob([pdfBytes], { type: 'application/pdf' }), `page-${i}.pdf`);
                    };
                    reader.readAsDataURL(blob);
                }
                
                setTimeout(() => {
                    updateStatus(`Конвертация завершена! ${totalPages} страниц → PNG в PDF`, 'success');
                    showNotification(`Создано ${totalPages} PDF страниц с изображениями`, 'success');
                }, 1000);
            }
        } catch (error) {
            console.error('Convert from PDF error:', error);
            updateStatus('Ошибка: ' + error.message, 'error');
            showNotification('Ошибка конвертации: ' + error.message, 'error');
        }
    }

    function updateStatus(message, type = 'info') {
        const icons = {
            info: 'fa-info-circle',
            success: 'fa-check-circle',
            error: 'fa-exclamation-circle',
            warning: 'fa-exclamation-triangle'
        };
        statusEl.className = `status ${type}`;
        statusEl.innerHTML = `<i class="fas ${icons[type] || icons.info}"></i> ${message}`;
    }

    renderFileList();
    updateStatus('Добавьте файлы для конвертации', 'info');
    console.log('Converter module initialized');
}
