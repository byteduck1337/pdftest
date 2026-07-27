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
                <label>Режим:
                    <select id="convertMode">
                        <option value="auto">Авто</option>
                        <option value="toPdf">В PDF</option>
                        <option value="fromPdf">Из PDF</option>
                    </select>
                </label>
                <label id="outputFormatLabel">
                    Выходной формат:
                    <select id="outputFormatSelect">
                        <option value="png">PNG</option>
                        <option value="jpg">JPG</option>
                        <option value="txt">TXT</option>
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
    const formatLabel = document.getElementById('outputFormatLabel');
    const status = document.getElementById('convertStatus');
    const inputLabel = document.getElementById('inputFormatLabel');

    if (!drop || !input || !list || !convertBtn || !clearBtn) {
        console.error('[CONVERTER] missing elements');
        return;
    }

    function updateOutputFormatVisibility() {
        const mode = modeSelect.value;
        if (mode === 'toPdf') {
            formatLabel.style.display = 'none';
        } else {
            formatLabel.style.display = 'flex';
        }
        console.log('[CONVERTER] Mode changed to:', mode, 'output format visible:', mode !== 'toPdf');
    }

    modeSelect.addEventListener('change', updateOutputFormatVisibility);
    updateOutputFormatVisibility();

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

    async function extractTextFromDocx(arrayBuffer) {
        let text = '';
        
        try {
            if (window.JSZip) {
                const zip = await window.JSZip.loadAsync(arrayBuffer);
                const docFile = zip.file("word/document.xml");
                if (docFile) {
                    const xmlText = await docFile.async("text");
                    const matches = xmlText.match(/>([^<]+)</g) || [];
                    text = matches
                        .map(m => m.replace(/[<>]/g, '').trim())
                        .filter(t => t.length > 0)
                        .join(' ');
                    if (text.length > 10) {
                        console.log('[CONVERTER] Extracted via JSZip:', text.length, 'chars');
                        return text;
                    }
                }
            }
        } catch(e) {
            console.warn('[CONVERTER] JSZip failed:', e);
        }

        try {
            const result = await mammoth.extractRawText({ arrayBuffer: arrayBuffer });
            if (result.value && result.value.trim().length > 0) {
                console.log('[CONVERTER] Extracted via mammoth raw:', result.value.length, 'chars');
                return result.value;
            }
        } catch(e) {
            console.warn('[CONVERTER] Mammoth raw failed:', e);
        }

        try {
            const result = await mammoth.convertToHtml({ arrayBuffer: arrayBuffer });
            const htmlText = result.value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
            if (htmlText.length > 0) {
                console.log('[CONVERTER] Extracted via mammoth HTML:', htmlText.length, 'chars');
                return htmlText;
            }
        } catch(e) {
            console.warn('[CONVERTER] Mammoth HTML failed:', e);
        }

        return text || 'Текст не найден в документе';
    }

    async function renderDocxToCanvas(arrayBuffer, fileName) {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        try {
            const text = await extractTextFromDocx(arrayBuffer);
            
            const lines = text.split(/\s+/).filter(w => w.length > 0);
            const maxLines = Math.min(lines.length, 40);
            const lineHeight = 22;
            const padding = 40;
            const topOffset = 100;
            
            canvas.width = 800;
            canvas.height = Math.min(topOffset + maxLines * lineHeight + 80, 1200);
            
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            
            ctx.fillStyle = '#1a1a2e';
            ctx.font = 'bold 20px Arial';
            ctx.textAlign = 'left';
            ctx.fillText('📄 ' + fileName, padding, 50);
            
            ctx.font = '12px Arial';
            ctx.fillStyle = '#666666';
            ctx.fillText('Размер: ' + formatFileSize(arrayBuffer.byteLength), padding, 78);
            
            ctx.fillStyle = '#333333';
            ctx.font = '14px Arial';
            
            let y = topOffset;
            let currentLine = '';
            
            for (let i = 0; i < Math.min(lines.length, 40); i++) {
                const word = lines[i];
                if (currentLine.length === 0) {
                    currentLine = word;
                } else if ((currentLine + ' ' + word).length < 95) {
                    currentLine += ' ' + word;
                } else {
                    ctx.fillText(currentLine, padding, y);
                    y += lineHeight;
                    currentLine = word;
                }
            }
            
            if (currentLine) {
                ctx.fillText(currentLine, padding, y);
                y += lineHeight;
            }
            
            if (lines.length > 40) {
                ctx.fillStyle = '#999999';
                ctx.font = '12px Arial';
                ctx.fillText('... и еще ' + (lines.length - 40) + ' слов', padding, y + 10);
            }
            
            if (lines.length === 0 || text === 'Текст не найден в документе') {
                ctx.fillStyle = '#999999';
                ctx.font = '16px Arial';
                ctx.textAlign = 'center';
                ctx.fillText('Текст не найден в документе', canvas.width/2, canvas.height/2);
                ctx.font = '13px Arial';
                ctx.fillText('Попробуйте открыть файл в Microsoft Word', canvas.width/2, canvas.height/2 + 40);
            }
            
        } catch(e) {
            console.error('[CONVERTER] Render error:', e);
            canvas.width = 800;
            canvas.height = 400;
            
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            
            ctx.fillStyle = '#cc0000';
            ctx.font = 'bold 20px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('⚠️ Ошибка обработки документа', canvas.width/2, 160);
            
            ctx.fillStyle = '#333333';
            ctx.font = '15px Arial';
            ctx.fillText(fileName, canvas.width/2, 210);
            
            ctx.fillStyle = '#666666';
            ctx.font = '13px Arial';
            ctx.fillText('Ошибка: ' + e.message, canvas.width/2, 260);
        }
        
        return canvas;
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
                    const ext = f.name.split('.').pop().toLowerCase();
                    let canvas;
                    
                    try {
                        if (ext === 'docx') {
                            const arrayBuffer = await f.file.arrayBuffer();
                            canvas = await renderDocxToCanvas(arrayBuffer, f.name);
                        } else if (ext === 'doc' || ext === 'txt') {
                            const text = await f.file.text();
                            canvas = document.createElement('canvas');
                            const ctx = canvas.getContext('2d');
                            canvas.width = 800;
                            const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
                            canvas.height = Math.min(100 + lines.length * 22, 1200);
                            ctx.fillStyle = '#ffffff';
                            ctx.fillRect(0, 0, canvas.width, canvas.height);
                            ctx.fillStyle = '#1a1a2e';
                            ctx.font = 'bold 18px Arial';
                            ctx.fillText('📄 ' + f.name, 40, 50);
                            ctx.font = '13px Arial';
                            ctx.fillStyle = '#333333';
                            let y = 100;
                            for (let i = 0; i < Math.min(lines.length, 45); i++) {
                                ctx.fillText(lines[i].substring(0, 100), 40, y);
                                y += 22;
                            }
                        } else {
                            canvas = document.createElement('canvas');
                            const ctx = canvas.getContext('2d');
                            canvas.width = 800;
                            canvas.height = 300;
                            ctx.fillStyle = '#ffffff';
                            ctx.fillRect(0, 0, canvas.width, canvas.height);
                            ctx.fillStyle = '#999999';
                            ctx.font = '18px Arial';
                            ctx.textAlign = 'center';
                            ctx.fillText('Формат не поддерживается: ' + ext, canvas.width/2, 150);
                        }
                    } catch(e) {
                        console.error('[CONVERTER] Document conversion error:', e);
                        canvas = document.createElement('canvas');
                        const ctx = canvas.getContext('2d');
                        canvas.width = 800;
                        canvas.height = 300;
                        ctx.fillStyle = '#ffffff';
                        ctx.fillRect(0, 0, canvas.width, canvas.height);
                        ctx.fillStyle = '#cc0000';
                        ctx.font = '18px Arial';
                        ctx.textAlign = 'center';
                        ctx.fillText('⚠️ Ошибка: ' + e.message, canvas.width/2, 150);
                    }
                    
                    const dataUrl = canvas.toDataURL('image/png');
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
