import { downloadBlob, readFileAsDataURL, readFileAsArrayBuffer, showNotification, escapeHtml, formatFileSize, getFileType } from './utils.js';

let files = [];

export function initConverter() {
    const container = document.getElementById('convert');
    if (!container) { console.error('[CONVERTER] container not found'); return; }

    container.innerHTML = `
        <div class="tool-card">
            <h3><i class="fas fa-arrow-right-arrow-left"></i> Конвертация</h3>
            <div class="drop-zone" id="convertDropZone">
                <i class="fas fa-cloud-upload-alt"></i>
                <p>Перетащите файлы или <strong>кликните</strong></p>
                <p style="font-size:0.8rem;color:var(--text-muted);margin-top:6px;">PNG, JPG, WEBP, DOC, DOCX, XLS, XLSX, PDF</p>
                <input type="file" id="convertInput" multiple accept=".png,.jpg,.jpeg,.gif,.webp,.doc,.docx,.xls,.xlsx,.pdf" style="display:none;">
            </div>
            <div class="options-panel">
                <label>Входной формат: <span id="inputFormatLabel" style="font-weight:400;color:var(--text);">авто</span></label>
                <label>Выходной формат:
                    <select id="outputFormatSelect">
                        <option value="pdf">PDF</option>
                        <option value="png">PNG</option>
                        <option value="jpg">JPG</option>
                        <option value="txt">TXT</option>
                    </select>
                </label>
                <label>Режим:
                    <select id="convertMode">
                        <option value="auto">Авто</option>
                        <option value="toPdf">В PDF</option>
                        <option value="fromPdf">Из PDF</option>
                    </select>
                </label>
            </div>
            <div id="convertFileList" class="file-list"></div>
            <div class="btn-group">
                <button class="btn btn-primary" id="convertBtn"><i class="fas fa-play"></i> Конвертировать</button>
                <button class="btn btn-secondary" id="clearConvertBtn"><i class="fas fa-trash"></i> Очистить</button>
            </div>
            <div id="convertStatus" class="status"><i class="fas fa-info-circle"></i> Добавьте файлы</div>
        </div>
    `;

    const drop = document.getElementById('convertDropZone');
    const input = document.getElementById('convertInput');
    const list = document.getElementById('convertFileList');
    const convertBtn = document.getElementById('convertBtn');
    const clearBtn = document.getElementById('clearConvertBtn');
    const modeSelect = document.getElementById('convertMode');
    const formatSelect = document.getElementById('outputFormatSelect');
    const status = document.getElementById('convertStatus');
    const inputLabel = document.getElementById('inputFormatLabel');

    if (!drop || !input || !list || !convertBtn || !clearBtn) {
        console.error('[CONVERTER] missing elements');
        return;
    }

    drop.addEventListener('click', () => input.click());
    drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('dragover'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('dragover'));
    drop.addEventListener('drop', e => {
        e.preventDefault();
        drop.classList.remove('dragover');
        handleFiles(e.dataTransfer.files);
    });
    input.addEventListener('change', e => {
        if (e.target.files.length) handleFiles(e.target.files);
        input.value = '';
    });

    async function handleFiles(fileList) {
        const newFiles = Array.from(fileList).filter(f => getFileType(f.name) !== 'unknown');
        for (const f of newFiles) {
            const type = getFileType(f.name);
            try {
                const dataUrl = type === 'pdf' ? null : await readFileAsDataURL(f);
                const arrayBuffer = type === 'pdf' ? await readFileAsArrayBuffer(f) : null;
                files.push({ file: f, name: f.name, size: f.size, type, dataUrl, arrayBuffer });
            } catch (e) { console.error('[CONVERTER] read error:', f.name, e); }
        }
        renderList();
        updateStatus(`Добавлено ${newFiles.length} файлов`, 'info');
        if (files.length > 0) {
            const types = [...new Set(files.map(f => f.type))];
            inputLabel.textContent = types.join(', ');
        }
    }

    function renderList() {
        list.innerHTML = '';
        if (!files.length) {
            list.innerHTML = `<div style="text-align:center;color:var(--text-muted);padding:16px;"><i class="fas fa-inbox" style="display:block;font-size:1.6rem;margin-bottom:6px;"></i>Нет файлов</div>`;
            return;
        }
        files.forEach((f, i) => {
            const div = document.createElement('div');
            div.className = 'file-item';
            const icon = { image:'fa-image', document:'fa-file-alt', pdf:'fa-file-pdf' }[f.type] || 'fa-file';
            div.innerHTML = `
                <i class="fas ${icon}"></i>
                <span class="name">${escapeHtml(f.name)}</span>
                <span class="size">${formatFileSize(f.size)}</span>
                <span class="remove" data-index="${i}"><i class="fas fa-times"></i></span>
            `;
            list.appendChild(div);
        });
        list.querySelectorAll('.remove').forEach(el => {
            el.addEventListener('click', e => {
                const idx = parseInt(e.currentTarget.dataset.index);
                files.splice(idx, 1);
                renderList();
                updateStatus('Файл удалён', 'info');
                if (!files.length) inputLabel.textContent = 'авто';
            });
        });
    }

    clearBtn.addEventListener('click', () => { files = []; renderList(); updateStatus('Очищено', 'info'); inputLabel.textContent = 'авто'; showNotification('Очищено', 'info'); });

    convertBtn.addEventListener('click', async () => {
        if (!files.length) { showNotification('Добавьте файлы', 'warning'); return; }
        const mode = modeSelect.value;
        const outFormat = formatSelect.value;
        let targetMode = mode;
        if (mode === 'auto') {
            const allPdf = files.every(f => f.type === 'pdf');
            targetMode = allPdf ? 'fromPdf' : 'toPdf';
        }
        if (targetMode === 'toPdf') await convertToPdf(outFormat);
        else await convertFromPdf(outFormat);
    });

    async function renderDocxToImage(arrayBuffer) {
        return new Promise((resolve, reject) => {
            try {
                const blob = new Blob([arrayBuffer], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
                const url = URL.createObjectURL(blob);
                
                const iframe = document.createElement('iframe');
                iframe.style.position = 'absolute';
                iframe.style.left = '-9999px';
                iframe.style.top = '-9999px';
                iframe.style.width = '800px';
                iframe.style.height = '600px';
                document.body.appendChild(iframe);
                
                iframe.onload = function() {
                    try {
                        const doc = iframe.contentDocument || iframe.contentWindow.document;
                        const html = `
                            <html>
                                <head>
                                    <style>
                                        body { margin: 40px; font-family: Arial, sans-serif; }
                                        .document { max-width: 100%; }
                                        img { max-width: 100%; }
                                    </style>
                                </head>
                                <body>
                                    <div class="document">
                                        <h2>${escapeHtml('Документ')}</h2>
                                        <p>Используйте встроенный просмотрщик для конвертации в изображение</p>
                                    </div>
                                </body>
                            </html>
                        `;
                        doc.write(html);
                        doc.close();
                        
                        setTimeout(() => {
                            const canvas = document.createElement('canvas');
                            canvas.width = 800;
                            canvas.height = 600;
                            const ctx = canvas.getContext('2d');
                            ctx.fillStyle = '#ffffff';
                            ctx.fillRect(0, 0, 800, 600);
                            ctx.fillStyle = '#000000';
                            ctx.font = '20px Arial';
                            ctx.fillText('DOCX файл: ' + escapeHtml('документ'), 50, 100);
                            ctx.fillText('Для конвертации в изображение используйте', 50, 150);
                            ctx.fillText('встроенный просмотрщик браузера', 50, 200);
                            
                            document.body.removeChild(iframe);
                            URL.revokeObjectURL(url);
                            resolve(canvas.toDataURL('image/png'));
                        }, 500);
                    } catch(e) {
                        document.body.removeChild(iframe);
                        URL.revokeObjectURL(url);
                        reject(e);
                    }
                };
                
                iframe.src = url;
            } catch(e) {
                reject(e);
            }
        });
    }

    async function convertDocumentToImage(file, format) {
        try {
            const arrayBuffer = await file.arrayBuffer();
            const blob = new Blob([arrayBuffer], { 
                type: file.type || 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' 
            });
            const url = URL.createObjectURL(blob);
            
            const response = await fetch(url);
            const blobUrl = URL.createObjectURL(await response.blob());
            
            const img = new Image();
            img.src = blobUrl;
            await new Promise((resolve, reject) => {
                img.onload = resolve;
                img.onerror = () => {
                    URL.revokeObjectURL(blobUrl);
                    reject(new Error('Failed to load document'));
                };
            });
            
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            
            if (img.width > 0 && img.height > 0) {
                canvas.width = Math.min(img.width, 1200);
                canvas.height = Math.min(img.height, 1600);
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            } else {
                canvas.width = 800;
                canvas.height = 600;
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, 800, 600);
                ctx.fillStyle = '#333333';
                ctx.font = '24px Arial';
                ctx.textAlign = 'center';
                ctx.fillText('📄 ' + file.name, 400, 200);
                ctx.font = '18px Arial';
                ctx.fillText('Конвертация в PDF', 400, 280);
                ctx.fillText('Размер: ' + formatFileSize(file.size), 400, 320);
            }
            
            URL.revokeObjectURL(blobUrl);
            return canvas.toDataURL(format === 'png' ? 'image/png' : 'image/jpeg');
        } catch(e) {
            console.error('[CONVERTER] Document to image error:', e);
            
            const canvas = document.createElement('canvas');
            canvas.width = 800;
            canvas.height = 600;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, 800, 600);
            ctx.fillStyle = '#333333';
            ctx.font = '20px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('Ошибка конвертации документа', 400, 200);
            ctx.font = '16px Arial';
            ctx.fillText(file.name, 400, 260);
            ctx.fillText('Попробуйте открыть файл в Word или Google Docs', 400, 320);
            return canvas.toDataURL('image/png');
        }
    }

    async function convertToPdf(outFormat) {
        try {
            updateStatus('Конвертация в PDF...', 'info');
            const { PDFDocument } = PDFLib;
            const pdfDoc = await PDFDocument.create();
            
            for (const f of files) {
                console.log('[CONVERTER] Processing:', f.name, f.type);
                
                if (f.type === 'image') {
                    const img = new Image();
                    img.src = f.dataUrl;
                    await new Promise(r => { img.onload = r; img.onerror = r; });
                    if (!img.width || !img.height) {
                        console.error('[CONVERTER] Invalid image:', f.name);
                        continue;
                    }
                    let embed;
                    const ext = f.name.split('.').pop().toLowerCase();
                    try {
                        if (ext === 'png') embed = await pdfDoc.embedPng(f.dataUrl);
                        else embed = await pdfDoc.embedJpg(f.dataUrl);
                    } catch(e) {
                        console.error('[CONVERTER] Image embed error:', e);
                        continue;
                    }
                    const page = pdfDoc.addPage([img.width, img.height]);
                    page.drawImage(embed, { x:0, y:0, width:img.width, height:img.height });
                    
                } else if (f.type === 'document') {
                    try {
                        const dataUrl = await convertDocumentToImage(f.file, outFormat);
                        const img = new Image();
                        img.src = dataUrl;
                        await new Promise(r => { img.onload = r; img.onerror = r; });
                        
                        if (img.width && img.height) {
                            let embed;
                            try {
                                embed = await pdfDoc.embedPng(dataUrl);
                            } catch(e) {
                                embed = await pdfDoc.embedJpg(dataUrl);
                            }
                            const page = pdfDoc.addPage([img.width, img.height]);
                            page.drawImage(embed, { x:0, y:0, width:img.width, height:img.height });
                        } else {
                            const page = pdfDoc.addPage([595, 842]);
                            const font = await pdfDoc.embedFont(PDFLib.StandardFonts.Helvetica);
                            page.drawText(f.name, { x: 50, y: 800, size: 16, font });
                            page.drawText('Не удалось конвертировать документ', { x: 50, y: 750, size: 12, font });
                        }
                    } catch(e) {
                        console.error('[CONVERTER] Document conversion error:', e);
                        const page = pdfDoc.addPage([595, 842]);
                        const font = await pdfDoc.embedFont(PDFLib.StandardFonts.Helvetica);
                        page.drawText('Ошибка: ' + f.name, { x: 50, y: 800, size: 14, font });
                        page.drawText(e.message || 'Неизвестная ошибка', { x: 50, y: 760, size: 10, font });
                    }
                } else if (f.type === 'pdf') {
                    try {
                        const pdf = await PDFDocument.load(f.arrayBuffer);
                        const pages = await pdfDoc.copyPages(pdf, pdf.getPageIndices());
                        pages.forEach(p => pdfDoc.addPage(p));
                    } catch(e) {
                        console.error('[CONVERTER] PDF copy error:', e);
                    }
                }
            }

            const pdfBytes = await pdfDoc.save();
            downloadBlob(new Blob([pdfBytes], {type:'application/pdf'}), 'converted.pdf');
            updateStatus(`Готово! ${files.length} файлов → PDF`, 'success');
            showNotification('PDF создан', 'success');
        } catch(e) {
            console.error('[CONVERTER] toPdf error:', e);
            updateStatus('Ошибка: ' + e.message, 'error');
            showNotification('Ошибка: ' + e.message, 'error');
        }
    }

    async function convertFromPdf(outFormat) {
        try {
            const pdfFiles = files.filter(f => f.type === 'pdf');
            if (!pdfFiles.length) { showNotification('Нет PDF', 'warning'); return; }
            updateStatus('Конвертация из PDF...', 'info');
            
            const pdfJsDoc = await pdfjsLib.getDocument({ data: pdfFiles[0].arrayBuffer }).promise;
            
            if (outFormat === 'png' || outFormat === 'jpg') {
                const mimeType = outFormat === 'png' ? 'image/png' : 'image/jpeg';
                const ext = outFormat === 'png' ? 'png' : 'jpg';
                
                for (let i = 1; i <= pdfJsDoc.numPages; i++) {
                    const page = await pdfJsDoc.getPage(i);
                    const viewport = page.getViewport({ scale: 1.5 });
                    const canvas = document.createElement('canvas');
                    canvas.width = viewport.width; 
                    canvas.height = viewport.height;
                    const ctx = canvas.getContext('2d');
                    await page.render({ canvasContext: ctx, viewport }).promise;
                    const blob = await new Promise(r => canvas.toBlob(r, mimeType));
                    downloadBlob(blob, `page-${i}.${ext}`);
                }
                updateStatus(`${pdfJsDoc.numPages} страниц → ${outFormat.toUpperCase()}`, 'success');
                showNotification(`${pdfJsDoc.numPages} ${outFormat.toUpperCase()}`, 'success');
            } else {
                let allText = '';
                for (let i = 1; i <= pdfJsDoc.numPages; i++) {
                    const page = await pdfJsDoc.getPage(i);
                    const content = await page.getTextContent();
                    const text = content.items.map(t => t.str).join(' ');
                    allText += text + '\n\n';
                }
                const blob = new Blob([allText], {type:'text/plain;charset=utf-8'});
                downloadBlob(blob, 'extracted.txt');
                updateStatus('Текст извлечён', 'success');
                showNotification('TXT готов', 'success');
            }
        } catch(e) {
            console.error('[CONVERTER] fromPdf error:', e);
            updateStatus('Ошибка: ' + e.message, 'error');
            showNotification('Ошибка: ' + e.message, 'error');
        }
    }

    function updateStatus(msg, type='info') {
        const icons = { info:'fa-info-circle', success:'fa-check-circle', error:'fa-exclamation-circle', warning:'fa-exclamation-triangle' };
        status.className = `status ${type}`;
        status.innerHTML = `<i class="fas ${icons[type] || icons.info}"></i> ${msg}`;
    }

    renderList();
    updateStatus('Добавьте файлы', 'info');
}
