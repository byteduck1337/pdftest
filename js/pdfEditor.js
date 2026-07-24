import { downloadBlob, readFileAsArrayBuffer, showNotification } from './utils.js';

let pdfDoc = null;
let pdfJsDoc = null;
let currentPage = 1;
let totalPages = 0;
let scale = 1.5;
let currentMode = 'edit';
let selectedTextRange = null;
let extractedItems = [];
let renderTask = null;
let isSelecting = false;
let selectionStart = null;
let canvas, ctx;
let customFont = null;
let currentPdfBytes = null;
let isRendering = false;
let renderTimeout = null;

export function initPdfEditor() {
    console.log('PDF Editor module initializing');
    const container = document.getElementById('edit');
    if (!container) {
        console.error('Container #edit not found');
        return;
    }
    
    container.innerHTML = `
        <div class="tool-card">
            <h3><i class="fas fa-pen-fancy"></i> Редактор PDF</h3>
            
            <div class="pdf-toolbar">
                <div class="drop-zone" id="pdfDropZone" style="padding:20px; flex:1;">
                    <i class="fas fa-cloud-upload-alt"></i>
                    <span>Перетащите PDF или <button class="btn btn-secondary btn-sm" id="selectPdfBtn" style="margin-left:10px;">Выбрать</button></span>
                    <input type="file" id="pdfInput" accept=".pdf" style="display:none;">
                </div>
                <button class="btn btn-primary" id="savePdfBtn"><i class="fas fa-save"></i> Сохранить</button>
                <button class="btn btn-secondary" id="rotateCwBtn"><i class="fas fa-redo-alt"></i> Повернуть</button>
                <button class="btn btn-secondary" id="extractTextBtn"><i class="fas fa-copy"></i> Извлечь текст</button>
            </div>
            
            <div class="mode-selector">
                <button class="mode-btn active" data-mode="edit"><i class="fas fa-pencil-alt"></i> Редактировать</button>
                <button class="mode-btn" data-mode="add"><i class="fas fa-plus"></i> Добавить</button>
                <button class="mode-btn" data-mode="delete"><i class="fas fa-eraser"></i> Удалить</button>
                <button class="mode-btn" data-mode="watermark"><i class="fas fa-stamp"></i> Водяной знак</button>
            </div>
            
            <div class="edit-controls">
                <input type="text" id="editTextInput" placeholder="Введите текст..." style="flex:2;">
                <select id="fontSelect">
                    <option value="times">Times Roman</option>
                    <option value="helvetica">Helvetica</option>
                    <option value="courier">Courier</option>
                </select>
                <input type="number" id="fontSize" value="16" min="8" max="72" style="max-width:70px;">
                <select id="fontColor">
                    <option value="black">Черный</option>
                    <option value="red">Красный</option>
                    <option value="blue">Синий</option>
                    <option value="green">Зеленый</option>
                </select>
                <button class="btn btn-primary btn-sm" id="applyEditBtn"><i class="fas fa-check"></i> Применить</button>
            </div>
            
            <div class="canvas-container" style="position:relative;">
                <canvas id="pdfCanvas"></canvas>
                <div id="selectionBox" style="position:absolute; border:2px dashed var(--primary); pointer-events:none; display:none; border-radius:4px; background:rgba(108,92,231,0.05);"></div>
            </div>
            
            <div style="display:flex; justify-content:center; gap:16px; margin:16px 0; align-items:center;">
                <button class="btn btn-secondary btn-sm" id="prevPageBtn"><i class="fas fa-chevron-left"></i></button>
                <span id="pageInfo" style="color:var(--text-secondary); font-weight:500;">Страница 0 / 0</span>
                <button class="btn btn-secondary btn-sm" id="nextPageBtn"><i class="fas fa-chevron-right"></i></button>
            </div>
            
            <div id="statusArea" class="status">
                <i class="fas fa-info-circle"></i> Загрузите PDF для начала работы
            </div>
            
            <div id="extractedTextPanel" style="display:none; margin-top:16px;">
                <h4 style="color:var(--text-secondary); margin-bottom:12px;"><i class="fas fa-copy"></i> Извлечённый текст</h4>
                <pre id="extractedTextContent" style="background:rgba(0,0,0,0.3); padding:16px; border-radius:8px; max-height:200px; overflow:auto; color:var(--text-secondary); font-family:'Inter',monospace; font-size:0.9rem; white-space:pre-wrap;"></pre>
                <div class="btn-group" style="margin-top:12px;">
                    <button class="btn btn-secondary btn-sm" id="copyExtractedBtn"><i class="fas fa-copy"></i> Копировать</button>
                    <button class="btn btn-secondary btn-sm" id="closeExtractedBtn">Закрыть</button>
                </div>
            </div>
        </div>
    `;

    canvas = document.getElementById('pdfCanvas');
    ctx = canvas.getContext('2d');

    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';

    const selectBtn = document.getElementById('selectPdfBtn');
    const fileInput = document.getElementById('pdfInput');
    const dropZone = document.getElementById('pdfDropZone');
    const saveBtn = document.getElementById('savePdfBtn');
    const rotateBtn = document.getElementById('rotateCwBtn');
    const extractBtn = document.getElementById('extractTextBtn');
    const prevBtn = document.getElementById('prevPageBtn');
    const nextBtn = document.getElementById('nextPageBtn');
    const applyBtn = document.getElementById('applyEditBtn');
    const editInput = document.getElementById('editTextInput');

    if (!canvas || !selectBtn || !fileInput || !dropZone) {
        console.error('PDF Editor elements not found');
        return;
    }

    console.log('PDF Editor elements found');

    selectBtn.addEventListener('click', () => fileInput.click());
    dropZone.addEventListener('dragover', e => e.preventDefault());
    dropZone.addEventListener('drop', e => {
        e.preventDefault();
        const file = e.dataTransfer.files[0];
        if (file?.type === 'application/pdf') loadPdf(file);
    });
    fileInput.addEventListener('change', e => {
        if (e.target.files[0]) loadPdf(e.target.files[0]);
    });

    saveBtn.addEventListener('click', savePdf);
    rotateBtn.addEventListener('click', rotatePage);
    extractBtn.addEventListener('click', extractAndShowText);
    prevBtn.addEventListener('click', () => changePage(-1));
    nextBtn.addEventListener('click', () => changePage(1));
    applyBtn.addEventListener('click', applyEdit);

    editInput.addEventListener('keypress', e => {
        if (e.key === 'Enter') {
            applyEdit();
            e.preventDefault();
        }
    });

    document.querySelectorAll('.mode-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentMode = btn.dataset.mode;
            updateStatus();
            clearSelection();
        });
    });

    canvas.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mouseup', onMouseUp);
    canvas.addEventListener('click', onCanvasClick);

    document.getElementById('copyExtractedBtn').addEventListener('click', () => {
        const text = document.getElementById('extractedTextContent').textContent;
        navigator.clipboard.writeText(text).then(() => showNotification('Текст скопирован', 'success'));
    });
    document.getElementById('closeExtractedBtn').addEventListener('click', () => {
        document.getElementById('extractedTextPanel').style.display = 'none';
    });

    async function loadCyrillicFont() {
        try {
            const fontUrl = 'https://fonts.gstatic.com/s/roboto/v30/KFOmCnqEu92Fr1Mu4mxP.ttf';
            const fontBytes = await fetch(fontUrl).then(res => res.arrayBuffer());
            pdfDoc.registerFontkit(window.fontkit);
            customFont = await pdfDoc.embedFont(fontBytes);
            console.log('Cyrillic font loaded');
        } catch (e) {
            console.warn('Failed to load Roboto:', e);
        }
    }

    async function loadPdf(file) {
        console.log('Loading PDF:', file.name);
        try {
            const arrayBuffer = await readFileAsArrayBuffer(file);
            currentPdfBytes = arrayBuffer;
            pdfDoc = await PDFLib.PDFDocument.load(arrayBuffer);
            await loadCyrillicFont();
            pdfJsDoc = await pdfjsLib.getDocument({ data: arrayBuffer.slice(0) }).promise;
            totalPages = pdfJsDoc.numPages;
            currentPage = 1;
            await renderPage();
            updatePageInfo();
            updateStatus(`PDF "${file.name}" загружен (${totalPages} страниц)`);
            showNotification(`PDF "${file.name}" загружен`, 'success');
        } catch (err) {
            console.error('Load PDF error:', err);
            showNotification('Ошибка загрузки PDF: ' + err.message, 'error');
            updateStatus('Ошибка загрузки: ' + err.message, 'error');
        }
    }

    async function renderPage() {
        if (!pdfJsDoc) return;
        if (isRendering) return;
        
        isRendering = true;
        
        if (renderTask) {
            try { 
                await renderTask.cancel(); 
            } catch(e) {}
            renderTask = null;
        }
        
        try {
            const page = await pdfJsDoc.getPage(currentPage);
            const viewport = page.getViewport({ scale });
            
            if (canvas.width !== viewport.width || canvas.height !== viewport.height) {
                canvas.width = viewport.width;
                canvas.height = viewport.height;
            }
            
            const renderContext = { canvasContext: ctx, viewport };
            renderTask = page.render(renderContext);
            await renderTask.promise;
            renderTask = null;

            const textContent = await page.getTextContent();
            extractedItems = textContent.items.map(item => {
                const tx = item.transform;
                const x = tx[4] * scale;
                const y = canvas.height - (tx[5] * scale);
                const width = item.width * scale;
                const height = (item.height || Math.abs(tx[0]) * 1.2) * scale;
                return {
                    text: item.str,
                    x, y, width, height,
                    original: item,
                    pdfX: tx[4],
                    pdfY: tx[5],
                    fontSize: Math.abs(tx[0])
                };
            });
            
            if (selectedTextRange) {
                highlightSelection(selectedTextRange);
            }
            
        } catch (err) {
            if (err.name !== 'RenderingCancelledException') {
                console.warn('Render error:', err);
            }
        } finally {
            isRendering = false;
        }
    }

    function updatePageInfo() {
        document.getElementById('pageInfo').textContent = `Страница ${currentPage} / ${totalPages}`;
    }

    async function changePage(delta) {
        const newPage = currentPage + delta;
        if (newPage >= 1 && newPage <= totalPages) {
            currentPage = newPage;
            selectedTextRange = null;
            await renderPage();
            updatePageInfo();
            updateStatus();
        }
    }

    function onMouseDown(e) {
        if (currentMode !== 'edit') return;
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        selectionStart = {
            x: (e.clientX - rect.left) * scaleX,
            y: (e.clientY - rect.top) * scaleY
        };
        isSelecting = true;
        document.getElementById('selectionBox').style.display = 'none';
    }

    function onMouseMove(e) {
        if (!isSelecting) return;
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        const currentX = (e.clientX - rect.left) * scaleX;
        const currentY = (e.clientY - rect.top) * scaleY;

        const box = document.getElementById('selectionBox');
        const left = Math.min(selectionStart.x, currentX);
        const top = Math.min(selectionStart.y, currentY);
        const width = Math.abs(currentX - selectionStart.x);
        const height = Math.abs(currentY - selectionStart.y);

        box.style.display = 'block';
        box.style.left = left + 'px';
        box.style.top = top + 'px';
        box.style.width = width + 'px';
        box.style.height = height + 'px';
    }

    function onMouseUp(e) {
        if (!isSelecting) return;
        isSelecting = false;
        const box = document.getElementById('selectionBox');
        box.style.display = 'none';

        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        const end = {
            x: (e.clientX - rect.left) * scaleX,
            y: (e.clientY - rect.top) * scaleY
        };

        const selected = findTextInArea(selectionStart, end);
        if (selected) {
            selectedTextRange = selected;
            const input = document.getElementById('editTextInput');
            input.value = selected.text;
            input.focus();
            input.select();
            updateStatus(`Выделено: "${selected.text.substring(0, 40)}${selected.text.length > 40 ? '...' : ''}"`);
            renderPage();
        } else {
            updateStatus('Текст не найден в выделенной области');
        }
    }

    function findTextInArea(p1, p2) {
        const minX = Math.min(p1.x, p2.x);
        const maxX = Math.max(p1.x, p2.x);
        const minY = Math.min(p1.y, p2.y);
        const maxY = Math.max(p1.y, p2.y);

        const items = extractedItems.filter(item => {
            return item.x < maxX + 5 && (item.x + item.width) > minX - 5 &&
                   item.y < maxY + 5 && (item.y + item.height) > minY - 5;
        });
        if (items.length === 0) return null;

        items.sort((a, b) => b.y - a.y || a.x - b.x);
        const text = items.map(i => i.text).join(' ');
        return { text, items, bounds: { minX, maxX, minY, maxY } };
    }

    function highlightSelection(selected) {
        if (!selected || !selected.bounds) return;
        ctx.save();
        ctx.strokeStyle = '#6C5CE7';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        ctx.strokeRect(
            selected.bounds.minX - 2,
            selected.bounds.minY - 2,
            selected.bounds.maxX - selected.bounds.minX + 4,
            selected.bounds.maxY - selected.bounds.minY + 4
        );
        ctx.restore();
    }

    function clearSelection() {
        selectedTextRange = null;
        document.getElementById('selectionBox').style.display = 'none';
        if (pdfJsDoc && !isRendering) {
            renderPage();
        }
    }

    async function onCanvasClick(e) {
        if (!pdfDoc) {
            showNotification('Сначала загрузите PDF', 'warning');
            return;
        }
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        const clickX = (e.clientX - rect.left) * scaleX;
        const clickY = (e.clientY - rect.top) * scaleY;

        if (currentMode === 'add') {
            await addTextAt(clickX, clickY);
        } else if (currentMode === 'delete') {
            await deleteTextAt(clickX, clickY);
        } else if (currentMode === 'watermark') {
            await addWatermarkDialog();
        }
    }

    async function applyEdit() {
        if (currentMode === 'edit' && selectedTextRange) {
            await replaceText();
        } else if (currentMode === 'edit') {
            showNotification('Сначала выделите текст', 'warning');
        } else if (currentMode === 'add') {
            showNotification('Кликните на страницу, чтобы добавить текст', 'info');
        }
    }

    async function getFont() {
        const fontSelect = document.getElementById('fontSelect').value;
        if (customFont && fontSelect !== 'helvetica' && fontSelect !== 'courier') {
            return customFont;
        }
        if (fontSelect === 'times') return await pdfDoc.embedFont(PDFLib.StandardFonts.TimesRoman);
        if (fontSelect === 'courier') return await pdfDoc.embedFont(PDFLib.StandardFonts.Courier);
        return await pdfDoc.embedFont(PDFLib.StandardFonts.Helvetica);
    }

    async function replaceText() {
        const newText = document.getElementById('editTextInput').value.trim();
        if (!newText) {
            showNotification('Введите новый текст', 'warning');
            return;
        }

        try {
            const pages = pdfDoc.getPages();
            const page = pages[currentPage - 1];

            const font = await getFont();
            const fontSize = parseInt(document.getElementById('fontSize').value);
            const colorName = document.getElementById('fontColor').value;
            const color = {
                black: { r: 0, g: 0, b: 0 },
                red: { r: 1, g: 0, b: 0 },
                blue: { r: 0, g: 0, b: 1 },
                green: { r: 0, g: 1, b: 0 }
            }[colorName] || { r: 0, g: 0, b: 0 };

            const items = selectedTextRange.items;
            const minPdfX = Math.min(...items.map(i => i.pdfX));
            const maxPdfX = Math.max(...items.map(i => i.pdfX + i.width / scale));
            const minPdfY = Math.min(...items.map(i => i.pdfY));
            const maxPdfY = Math.max(...items.map(i => i.pdfY + i.fontSize));

            const padding = 2;
            page.drawRectangle({
                x: minPdfX - padding,
                y: minPdfY - padding,
                width: (maxPdfX - minPdfX) + 2 * padding,
                height: (maxPdfY - minPdfY) + 2 * padding,
                color: { r: 1, g: 1, b: 1 }
            });

            const firstItem = items[0];
            page.drawText(newText, {
                x: firstItem.pdfX,
                y: firstItem.pdfY,
                size: fontSize,
                font,
                color
            });

            await saveAndReload();
            showNotification('Текст заменён', 'success');
            updateStatus('Текст успешно заменён');
            clearSelection();
        } catch (error) {
            console.error('Replace text error:', error);
            showNotification('Ошибка: ' + error.message, 'error');
        }
    }

    async function addTextAt(x, y) {
        const text = document.getElementById('editTextInput').value.trim();
        if (!text) {
            showNotification('Введите текст в поле', 'warning');
            return;
        }

        try {
            const pages = pdfDoc.getPages();
            const page = pages[currentPage - 1];
            const { height } = page.getSize();

            const pdfX = x / scale;
            const pdfY = height - (y / scale);

            const font = await getFont();
            const fontSize = parseInt(document.getElementById('fontSize').value);
            const colorName = document.getElementById('fontColor').value;
            const color = {
                black: { r: 0, g: 0, b: 0 },
                red: { r: 1, g: 0, b: 0 },
                blue: { r: 0, g: 0, b: 1 },
                green: { r: 0, g: 1, b: 0 }
            }[colorName] || { r: 0, g: 0, b: 0 };

            page.drawText(text, {
                x: pdfX,
                y: pdfY - fontSize,
                size: fontSize,
                font,
                color
            });

            await saveAndReload();
            showNotification('Текст добавлен', 'success');
            updateStatus(`Текст "${text}" добавлен`);
        } catch (error) {
            console.error('Add text error:', error);
            showNotification('Ошибка: ' + error.message, 'error');
        }
    }

    async function deleteTextAt(x, y) {
        const item = extractedItems.find(i =>
            x >= i.x - 5 && x <= i.x + i.width + 5 &&
            y >= i.y - 5 && y <= i.y + i.height + 5
        );
        if (!item) {
            showNotification('Текст не найден. Кликните точно по тексту', 'warning');
            return;
        }

        try {
            const pages = pdfDoc.getPages();
            const page = pages[currentPage - 1];

            const pdfX = item.pdfX;
            const pdfY = item.pdfY;
            const width = item.width / scale;
            const heightRect = item.height / scale;

            page.drawRectangle({
                x: pdfX - 2,
                y: pdfY - 2,
                width: width + 4,
                height: heightRect + 4,
                color: { r: 1, g: 1, b: 1 }
            });

            await saveAndReload();
            showNotification(`Текст "${item.text}" удалён`, 'success');
            updateStatus('Текст удалён');
        } catch (error) {
            console.error('Delete text error:', error);
            showNotification('Ошибка: ' + error.message, 'error');
        }
    }

    async function addWatermarkDialog() {
        const text = prompt('Введите текст водяного знака:', 'КОНФИДЕНЦИАЛЬНО');
        if (!text) return;

        try {
            const pages = pdfDoc.getPages();
            const page = pages[currentPage - 1];
            const { width, height } = page.getSize();
            const font = await getFont();

            page.drawText(text, {
                x: width / 2 - 100,
                y: height / 2,
                size: 60,
                font,
                color: { r: 0.7, g: 0.7, b: 0.7 },
                opacity: 0.25,
                rotate: { angle: 45, type: 'degrees' }
            });

            await saveAndReload();
            showNotification('Водяной знак добавлен', 'success');
            updateStatus('Водяной знак добавлен');
        } catch (error) {
            console.error('Watermark error:', error);
            showNotification('Ошибка: ' + error.message, 'error');
        }
    }

    async function rotatePage() {
        if (!pdfDoc) return;
        try {
            const pages = pdfDoc.getPages();
            const page = pages[currentPage - 1];
            const rotation = page.getRotation();
            page.setRotation({ angle: (rotation.angle + 90) % 360 });
            await saveAndReload();
            showNotification('Страница повёрнута на 90°', 'success');
        } catch (error) {
            console.error('Rotate error:', error);
            showNotification('Ошибка: ' + error.message, 'error');
        }
    }

    async function saveAndReload() {
        const pdfBytes = await pdfDoc.save();
        currentPdfBytes = pdfBytes;
        pdfDoc = await PDFLib.PDFDocument.load(pdfBytes);
        await loadCyrillicFont();
        pdfJsDoc = await pdfjsLib.getDocument({ data: pdfBytes.slice(0) }).promise;
        totalPages = pdfJsDoc.numPages;
        selectedTextRange = null;
        await renderPage();
        updatePageInfo();
    }

    async function savePdf() {
        if (!pdfDoc) {
            showNotification('Нет загруженного PDF', 'warning');
            return;
        }
        const pdfBytes = await pdfDoc.save();
        downloadBlob(new Blob([pdfBytes], { type: 'application/pdf' }), 'edited.pdf');
        showNotification('PDF сохранён', 'success');
        updateStatus('PDF сохранён');
    }

    async function extractAndShowText() {
        if (!pdfJsDoc) {
            showNotification('Сначала загрузите PDF', 'warning');
            return;
        }
        let allText = '';
        for (let i = 1; i <= pdfJsDoc.numPages; i++) {
            const page = await pdfJsDoc.getPage(i);
            const content = await page.getTextContent();
            allText += content.items.map(item => item.str).join(' ') + '\n\n';
        }
        document.getElementById('extractedTextContent').textContent = allText;
        document.getElementById('extractedTextPanel').style.display = 'block';
        updateStatus(`Извлечено ${pdfJsDoc.numPages} страниц текста`);
    }

    function updateStatus(message) {
        const statusEl = document.getElementById('statusArea');
        if (message) {
            statusEl.innerHTML = `<i class="fas fa-info-circle"></i> ${message}`;
        } else {
            const descriptions = {
                edit: 'Режим редактирования: выделите текст мышью, измените и нажмите Enter',
                add: 'Режим добавления: введите текст и кликните на страницу',
                delete: 'Режим удаления: кликните по тексту для удаления',
                watermark: 'Режим водяного знака: кликните для добавления'
            };
            statusEl.innerHTML = `<i class="fas fa-info-circle"></i> ${descriptions[currentMode] || 'Выберите режим'}`;
        }
    }

    updateStatus('Загрузите PDF файл для начала работы');
    console.log('PDF Editor module initialized');
}
