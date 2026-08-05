import { downloadBlob, readFileAsDataURL, readFileAsArrayBuffer, showNotification, escapeHtml } from './utils.js';

let files = [];
let pageSize = 'fit';
let isProcessing = false;

export function initConverter() {
    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('fileInput');
    const filesGrid = document.getElementById('filesGrid');
    const convertBtn = document.getElementById('convertBtn');
    const convertSelectedBtn = document.getElementById('convertSelectedBtn');
    const clearAllBtn = document.getElementById('clearAllBtn');
    const selectAllBtn = document.getElementById('selectAllBtn');
    const sortBtn = document.getElementById('sortBtn');
    const pageSizeSelect = document.getElementById('pageSize');
    const qualitySlider = document.getElementById('quality');
    const qualityLabel = document.getElementById('qualityLabel');
    const fileCount = document.getElementById('fileCount');
    const totalSize = document.getElementById('totalSize');
    const filesSection = document.getElementById('filesSection');
    const progressSection = document.getElementById('progressSection');
    const progressFill = document.getElementById('progressFill');
    const progressText = document.getElementById('progressText');
    const progressPercent = document.getElementById('progressPercent');

    // Настройки
    pageSizeSelect.addEventListener('change', e => pageSize = e.target.value);
    qualitySlider.addEventListener('input', e => {
        qualityLabel.textContent = e.target.value + '%';
    });

    // ============================================================
    // Drag & Drop - ПОЛНОСТЬЮ БЛОКИРУЕМ ВСЕ СОБЫТИЯ
    // ============================================================
    
    // Блокируем все события на уровне документа
    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    // Вешаем на все события, связанные с перетаскиванием
    document.addEventListener('dragenter', preventDefaults, false);
    document.addEventListener('dragover', preventDefaults, false);
    document.addEventListener('dragleave', preventDefaults, false);
    document.addEventListener('drop', preventDefaults, false);

    // Блокируем контекстное меню при перетаскивании
    document.addEventListener('contextmenu', (e) => {
        if (e.target.closest('.drop-zone')) {
            e.preventDefault();
        }
    });

    // События для зоны загрузки - только визуальные эффекты
    dropZone.addEventListener('dragenter', (e) => {
        preventDefaults(e);
        dropZone.classList.add('dragover');
    });

    dropZone.addEventListener('dragover', (e) => {
        preventDefaults(e);
        dropZone.classList.add('dragover');
    });

    dropZone.addEventListener('dragleave', (e) => {
        preventDefaults(e);
        dropZone.classList.remove('dragover');
    });

    // ОСНОВНОЕ СОБЫТИЕ DROP - здесь обрабатываем файлы
    dropZone.addEventListener('drop', (e) => {
        preventDefaults(e);
        dropZone.classList.remove('dragover');
        
        // Получаем файлы из события
        const droppedFiles = e.dataTransfer.files;
        if (droppedFiles && droppedFiles.length > 0) {
            handleFiles(droppedFiles);
        }
    });

    // Клик для выбора файлов
    dropZone.addEventListener('click', () => {
        fileInput.click();
    });

    fileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files.length > 0) {
            handleFiles(e.target.files);
            fileInput.value = '';
        }
    });

    // Обработка файлов
    async function handleFiles(fileList) {
        const validExts = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'tiff', 'svg', 'do'];
        const validFiles = Array.from(fileList).filter(f => {
            const ext = f.name.split('.').pop().toLowerCase();
            return validExts.includes(ext);
        });

        if (validFiles.length === 0) {
            showNotification('Нет поддерживаемых файлов. Поддерживаются: .do (PDF) и изображения', 'warning');
            return;
        }

        if (validFiles.length !== fileList.length) {
            showNotification(`Загружено ${validFiles.length} из ${fileList.length} файлов (неподдерживаемые пропущены)`, 'info');
        }

        let loaded = 0;
        for (const file of validFiles) {
            try {
                const ext = file.name.split('.').pop().toLowerCase();
                const isDoFile = ext === 'do';
                const isImage = !isDoFile;
                
                let dataUrl = null;
                let width = 0, height = 0;
                
                if (isImage) {
                    dataUrl = await readFileAsDataURL(file);
                    const img = new Image();
                    img.src = dataUrl;
                    await new Promise((resolve, reject) => { 
                        img.onload = resolve;
                        img.onerror = reject;
                    });
                    width = img.width;
                    height = img.height;
                }

                files.push({
                    file,
                    dataUrl,
                    width,
                    height,
                    rotation: 0,
                    isDoFile,
                    isImage,
                    name: file.name,
                    size: file.size,
                    selected: true
                });

                loaded++;
            } catch (err) {
                console.error('Ошибка загрузки файла:', file.name, err);
            }
        }

        renderFiles();
        updateStats();
        showNotification(`Загружено ${files.length} файлов`, 'success');
    }

    // Рендер файлов
    function renderFiles() {
        if (files.length > 0) {
            filesSection.classList.add('has-files');
        } else {
            filesSection.classList.remove('has-files');
        }

        filesGrid.innerHTML = '';
        files.forEach((file, index) => {
            const item = document.createElement('div');
            item.className = `file-item${file.selected ? ' selected' : ''}`;
            item.dataset.index = index;

            let thumbnail = '';
            if (file.isDoFile) {
                thumbnail = `
                    <div class="file-thumbnail" style="background: #fee2e2;">
                        <i class="fas fa-file-pdf file-icon" style="color:#dc2626; font-size:3rem;"></i>
                        <span class="file-badge" style="background:#dc2626;">PDF</span>
                    </div>
                `;
            } else {
                thumbnail = `
                    <div class="file-thumbnail">
                        <img src="${escapeHtml(file.dataUrl)}" alt="${escapeHtml(file.name)}" style="transform: rotate(${file.rotation}deg);">
                        <span class="file-badge">${file.width}×${file.height}</span>
                    </div>
                `;
            }

            const sizeStr = formatFileSize(file.size);
            const fileType = file.isDoFile ? '📄 PDF (.do)' : '🖼️ Изображение';

            item.innerHTML = `
                ${thumbnail}
                <div class="file-info">
                    <span class="file-name" title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</span>
                    <div class="file-meta">
                        <span>${sizeStr}</span>
                        <span style="font-size:0.65rem; color:${file.isDoFile ? '#dc2626' : 'var(--primary)'};">${fileType}</span>
                        ${!file.isDoFile ? `<span>${file.width}×${file.height}</span>` : ''}
                    </div>
                </div>
                <div class="file-actions">
                    <div class="checkbox-wrapper">
                        <input type="checkbox" class="file-select" ${file.selected ? 'checked' : ''}>
                        <span style="font-size:0.7rem;color:var(--gray);">Выбрать</span>
                    </div>
                    <div>
                        ${!file.isDoFile ? `<button class="btn-icon btn-rotate" data-index="${index}" title="Повернуть"><i class="fas fa-undo-alt"></i></button>` : ''}
                        <button class="btn-icon btn-remove" data-index="${index}" title="Удалить"><i class="fas fa-times"></i></button>
                    </div>
                </div>
            `;

            filesGrid.appendChild(item);
        });

        // Обработчики
        document.querySelectorAll('.file-select').forEach((checkbox, idx) => {
            checkbox.addEventListener('change', () => {
                files[idx].selected = checkbox.checked;
                const parent = checkbox.closest('.file-item');
                parent.classList.toggle('selected');
            });
        });

        document.querySelectorAll('.btn-rotate').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const idx = parseInt(e.currentTarget.dataset.index);
                files[idx].rotation = (files[idx].rotation + 90) % 360;
                renderFiles();
            });
        });

        document.querySelectorAll('.btn-remove').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const idx = parseInt(e.currentTarget.dataset.index);
                files.splice(idx, 1);
                renderFiles();
                updateStats();
                if (files.length === 0) {
                    filesSection.classList.remove('has-files');
                }
            });
        });
    }

    // Обновление статистики
    function updateStats() {
        fileCount.textContent = files.length;
        const total = files.reduce((sum, f) => sum + f.size, 0);
        totalSize.textContent = formatFileSize(total);
    }

    function formatFileSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' КБ';
        return (bytes / 1048576).toFixed(1) + ' МБ';
    }

    // Сортировка
    sortBtn.addEventListener('click', () => {
        files.sort((a, b) => a.name.localeCompare(b.name));
        renderFiles();
        showNotification('Отсортировано по имени', 'info');
    });

    // Выбор всех
    selectAllBtn.addEventListener('click', () => {
        const allSelected = files.every(f => f.selected);
        files.forEach(f => f.selected = !allSelected);
        renderFiles();
    });

    // Очистка
    clearAllBtn.addEventListener('click', () => {
        if (files.length === 0) return;
        if (confirm('Удалить все файлы?')) {
            files = [];
            renderFiles();
            updateStats();
            filesSection.classList.remove('has-files');
            fileInput.value = '';
            showNotification('Все файлы удалены', 'info');
        }
    });

    // Конвертация
    async function convertFiles(filesToConvert) {
        if (filesToConvert.length === 0) {
            showNotification('Нет файлов для конвертации', 'warning');
            return;
        }

        if (isProcessing) return;
        isProcessing = true;
        convertBtn.disabled = true;
        convertSelectedBtn.disabled = true;
        progressSection.style.display = 'block';

        try {
            const { PDFDocument } = PDFLib;
            const quality = parseInt(qualitySlider.value) / 100;
            const total = filesToConvert.length;

            for (let i = 0; i < total; i++) {
                const file = filesToConvert[i];
                const percent = Math.round(((i + 1) / total) * 100);
                progressFill.style.width = percent + '%';
                progressText.textContent = `Конвертация ${i+1}/${total}: ${file.name}`;
                progressPercent.textContent = percent + '%';

                if (file.isDoFile) {
                    await convertDoFile(file);
                } else {
                    const pdfDoc = await PDFDocument.create();
                    await convertImageToPdf(pdfDoc, file, quality);
                    const pdfBytes = await pdfDoc.save();
                    const baseName = file.name.replace(/\.[^.]+$/, '');
                    downloadBlob(new Blob([pdfBytes], { type: 'application/pdf' }), `${baseName}.pdf`);
                }
            }

            showNotification(`Конвертация завершена! ${total} файлов`, 'success');
        } catch (error) {
            console.error(error);
            showNotification('Ошибка конвертации: ' + error.message, 'error');
        } finally {
            isProcessing = false;
            convertBtn.disabled = false;
            convertSelectedBtn.disabled = false;
            progressSection.style.display = 'none';
            progressFill.style.width = '0%';
        }
    }

    // Конвертация .do файла (просто переименовываем)
    async function convertDoFile(file) {
        const arrayBuffer = await readFileAsArrayBuffer(file.file);
        const baseName = file.name.replace(/\.do$/i, '');
        const pdfBlob = new Blob([arrayBuffer], { type: 'application/pdf' });
        downloadBlob(pdfBlob, `${baseName}.pdf`);
    }

    convertBtn.addEventListener('click', () => {
        convertFiles(files.filter(f => f.selected));
    });

    convertSelectedBtn.addEventListener('click', () => {
        const selected = files.filter(f => f.selected);
        if (selected.length === 0) {
            showNotification('Выберите хотя бы один файл', 'warning');
            return;
        }
        convertFiles(selected);
    });
}

// Конвертация изображения в PDF
async function convertImageToPdf(pdfDoc, file, quality) {
    let imageEmbed;
    const ext = file.file.name.split('.').pop().toLowerCase();

    if (ext === 'png') {
        imageEmbed = await pdfDoc.embedPng(file.dataUrl);
    } else if (['jpg', 'jpeg'].includes(ext)) {
        const compressed = await compressImage(file.dataUrl, quality);
        imageEmbed = await pdfDoc.embedJpg(compressed);
    } else if (ext === 'gif') {
        const pngData = await convertToPng(file.dataUrl);
        imageEmbed = await pdfDoc.embedPng(pngData);
    } else {
        const pngData = await convertToPng(file.dataUrl);
        imageEmbed = await pdfDoc.embedPng(pngData);
    }

    const imgWidth = file.width;
    const imgHeight = file.height;

    if (pageSize === 'fit') {
        let page = pdfDoc.addPage([imgWidth, imgHeight]);
        if (file.rotation % 180 !== 0) {
            page.setSize(imgHeight, imgWidth);
        }
        const { width, height } = page.getSize();
        page.drawImage(imageEmbed, {
            x: 0, y: 0,
            width: file.rotation % 180 === 0 ? width : height,
            height: file.rotation % 180 === 0 ? height : width,
            rotate: file.rotation ? { angle: file.rotation } : undefined
        });
    } else {
        const sizes = { a4: [595, 842], letter: [612, 792], a3: [842, 1191] };
        let [pageWidth, pageHeight] = sizes[pageSize] || sizes.a4;

        const scale = Math.min(pageWidth / imgWidth, pageHeight / imgHeight);
        const scaledWidth = imgWidth * scale;
        const scaledHeight = imgHeight * scale;
        const x = (pageWidth - scaledWidth) / 2;
        const y = (pageHeight - scaledHeight) / 2;

        const page = pdfDoc.addPage([pageWidth, pageHeight]);
        page.drawImage(imageEmbed, { x, y, width: scaledWidth, height: scaledHeight });
    }
}

// Вспомогательные функции
function compressImage(dataUrl, quality) {
    return new Promise(resolve => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            canvas.toBlob(blob => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.readAsDataURL(blob);
            }, 'image/jpeg', quality);
        };
        img.src = dataUrl;
    });
}

function convertToPng(dataUrl) {
    return new Promise(resolve => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            resolve(canvas.toDataURL('image/png'));
        };
        img.src = dataUrl;
    });
}
