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
                        <option value="docx">DOCX</option>
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

    async function extractDocxText(arrayBuffer) {
        try {
            const result = await mammoth.extractRawText({ arrayBuffer: arrayBuffer });
            return result.value || '';
        } catch (e) {
            console.error('[CONVERTER] mammoth raw text error:', e);
            try {
                const result = await mammoth.convertToHtml({ arrayBuffer: arrayBuffer });
                const text = result.value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
                return text || '';
            } catch (e2) {
                console.error('[CONVERTER] mammoth html fallback error:', e2);
                return '';
            }
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
                    const ext = f.name.split('.').pop().toLowerCase();
                    const page = pdfDoc.addPage([595, 842]);
                    const font = await pdfDoc.embedFont(PDFLib.StandardFonts.Helvetica);
                    
                    let text = '';
                    if (ext === 'docx') {
                        try {
                            const arrayBuffer = await f.file.arrayBuffer();
                            text = await extractDocxText(arrayBuffer);
                        } catch(e) {
                            console.error('[CONVERTER] DOCX extract error:', e);
                            text = '[Ошибка извлечения текста из DOCX]';
                        }
                    } else if (ext === 'doc' || ext === 'txt') {
                        try {
                            text = await f.file.text();
                        } catch(e) {
                            console.error('[CONVERTER] Text read error:', e);
                            text = '[Ошибка чтения текста]';
                        }
                    } else if (ext === 'xlsx' || ext === 'xls') {
                        text = '[Excel файлы требуют специальной обработки]';
                    } else {
                        text = '[Неподдерживаемый формат документа]';
                    }

                    if (text && text.length > 0) {
                        const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
                        let y = 800;
                        const maxLines = 45;
                        const lineHeight = 16;
                        
                        for (let i = 0; i < Math.min(lines.length, maxLines); i++) {
                            const line = lines[i].substring(0, 120);
                            try {
                                page.drawText(line, { 
                                    x: 40, 
                                    y: y - i * lineHeight, 
                                    size: 10, 
                                    font,
                                    color: { r: 0, g: 0, b: 0 }
                                });
                            } catch(e) {
                                console.warn('[CONVERTER] Failed to draw text line:', i, e);
                            }
                        }
                        
                        if (lines.length > maxLines) {
                            try {
                                page.drawText('... и еще ' + (lines.length - maxLines) + ' строк', {
                                    x: 40,
                                    y: y - maxLines * lineHeight - 10,
                                    size: 10,
                                    font,
                                    color: { r: 0.5, g: 0.5, b: 0.5 }
                                });
                            } catch(e) {}
                        }
                    } else {
                        try {
                            page.drawText('[Нет текста для отображения]', {
                                x: 40,
                                y: 800,
                                size: 12,
                                font,
                                color: { r: 0.5, g: 0.5, b: 0.5 }
                            });
                        } catch(e) {}
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
            
            if (outFormat === 'png') {
                for (let i = 1; i <= pdfJsDoc.numPages; i++) {
                    const page = await pdfJsDoc.getPage(i);
                    const viewport = page.getViewport({ scale: 1.5 });
                    const canvas = document.createElement('canvas');
                    canvas.width = viewport.width; 
                    canvas.height = viewport.height;
                    const ctx = canvas.getContext('2d');
                    await page.render({ canvasContext: ctx, viewport }).promise;
                    const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
                    downloadBlob(blob, `page-${i}.png`);
                }
                updateStatus(`${pdfJsDoc.numPages} страниц → PNG`, 'success');
                showNotification(`${pdfJsDoc.numPages} PNG`, 'success');
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
