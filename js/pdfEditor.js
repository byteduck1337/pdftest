import { downloadBlob, readFileAsArrayBuffer, showNotification } from './utils.js';

let pdfDoc = null, pdfJsDoc = null, currentPage = 1, totalPages = 0, scale = 1.4;
let currentMode = 'edit', selectedTextRange = null, extractedItems = [];
let renderTask = null, isSelecting = false, selectionStart = null;
let canvas, ctx, customFont = null, currentPdfBytes = null;

export function initPdfEditor() {
    const container = document.getElementById('edit');
    if (!container) { console.error('[EDITOR] container not found'); return; }

    container.innerHTML = `
        <div class="tool-card">
            <h3><i class="fas fa-pen"></i> Редактор PDF</h3>
            <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:16px;">
                <div class="drop-zone" id="pdfDropZone" style="flex:1;padding:20px;display:flex;align-items:center;gap:12px;border:2px dashed var(--border);border-radius:var(--radius-sm);cursor:pointer;">
                    <i class="fas fa-cloud-upload-alt" style="font-size:1.6rem;"></i>
                    <span>Перетащите PDF или <strong>выберите</strong></span>
                    <input type="file" id="pdfInput" accept=".pdf" style="display:none;">
                </div>
                <button class="btn btn-primary" id="savePdfBtn"><i class="fas fa-save"></i> Сохранить</button>
                <button class="btn btn-secondary" id="rotateBtn"><i class="fas fa-rotate-right"></i></button>
                <button class="btn btn-secondary" id="extractBtn"><i class="fas fa-copy"></i> Текст</button>
            </div>
            <div class="mode-selector">
                <button class="mode-btn active" data-mode="edit"><i class="fas fa-pencil"></i> Правка</button>
                <button class="mode-btn" data-mode="add"><i class="fas fa-plus"></i> Добавить</button>
                <button class="mode-btn" data-mode="delete"><i class="fas fa-eraser"></i> Удалить</button>
                <button class="mode-btn" data-mode="watermark"><i class="fas fa-stamp"></i> Водяной знак</button>
            </div>
            <div class="edit-controls">
                <input type="text" id="editTextInput" placeholder="Текст..." style="flex:2;">
                <select id="fontSelect"><option value="times">Times</option><option value="helvetica">Helvetica</option><option value="courier">Courier</option></select>
                <input type="number" id="fontSize" value="14" min="8" max="72" style="max-width:70px;">
                <select id="fontColor"><option value="black">Черный</option><option value="red">Красный</option><option value="blue">Синий</option></select>
                <button class="btn btn-primary btn-sm" id="applyEditBtn"><i class="fas fa-check"></i> Применить</button>
            </div>
            <div class="canvas-container"><canvas id="pdfCanvas"></canvas></div>
            <div style="display:flex;justify-content:center;gap:16px;margin:12px 0;">
                <button class="btn btn-secondary btn-sm" id="prevPage"><i class="fas fa-chevron-left"></i></button>
                <span id="pageInfo" style="color:var(--text-secondary);font-weight:500;">0 / 0</span>
                <button class="btn btn-secondary btn-sm" id="nextPage"><i class="fas fa-chevron-right"></i></button>
            </div>
            <div id="statusArea" class="status"><i class="fas fa-info-circle"></i> Загрузите PDF</div>
            <div id="extractedTextPanel" style="display:none;margin-top:16px;">
                <h4 style="font-weight:500;margin-bottom:8px;"><i class="fas fa-copy"></i> Текст</h4>
                <pre id="extractedTextContent"></pre>
                <button class="btn btn-secondary btn-sm" id="closeExtracted" style="margin-top:8px;">Закрыть</button>
            </div>
        </div>
    `;

    canvas = document.getElementById('pdfCanvas');
    ctx = canvas.getContext('2d');
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';

    const drop = document.getElementById('pdfDropZone');
    const input = document.getElementById('pdfInput');
    const saveBtn = document.getElementById('savePdfBtn');
    const rotateBtn = document.getElementById('rotateBtn');
    const extractBtn = document.getElementById('extractBtn');
    const prevBtn = document.getElementById('prevPage');
    const nextBtn = document.getElementById('nextPage');
    const applyBtn = document.getElementById('applyEditBtn');
    const editInput = document.getElementById('editTextInput');

    if (!canvas || !drop || !input) { console.error('[EDITOR] missing elements'); return; }

    drop.addEventListener('click', () => input.click());
    drop.addEventListener('dragover', e => e.preventDefault());
    drop.addEventListener('drop', e => {
        e.preventDefault();
        const file = e.dataTransfer.files[0];
        if (file?.type === 'application/pdf') loadPdf(file);
    });
    input.addEventListener('change', e => { if (e.target.files[0]) loadPdf(e.target.files[0]); });

    saveBtn.addEventListener('click', savePdf);
    rotateBtn.addEventListener('click', rotatePage);
    extractBtn.addEventListener('click', extractAndShowText);
    prevBtn.addEventListener('click', () => changePage(-1));
    nextBtn.addEventListener('click', () => changePage(1));
    applyBtn.addEventListener('click', applyEdit);
    editInput.addEventListener('keypress', e => { if (e.key === 'Enter') applyEdit(); });

    document.querySelectorAll('.mode-btn').forEach(b => {
        b.addEventListener('click', () => {
            document.querySelectorAll('.mode-btn').forEach(x => x.classList.remove('active'));
            b.classList.add('active');
            currentMode = b.dataset.mode;
            updateStatus();
        });
    });

    canvas.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mouseup', onMouseUp);
    canvas.addEventListener('click', onCanvasClick);
    document.getElementById('closeExtracted').addEventListener('click', () => {
        document.getElementById('extractedTextPanel').style.display = 'none';
    });

    async function loadCyrillicFont() {
        try {
            const fontUrl = 'https://fonts.gstatic.com/s/roboto/v30/KFOmCnqEu92Fr1Mu4mxP.ttf';
            const bytes = await fetch(fontUrl).then(r => r.arrayBuffer());
            pdfDoc.registerFontkit(window.fontkit);
            customFont = await pdfDoc.embedFont(bytes);
        } catch(e) { console.warn('[EDITOR] font load skipped'); }
    }

    async function loadPdf(file) {
        try {
            const buf = await readFileAsArrayBuffer(file);
            currentPdfBytes = buf;
            pdfDoc = await PDFLib.PDFDocument.load(buf);
            await loadCyrillicFont();
            pdfJsDoc = await pdfjsLib.getDocument({ data: buf.slice(0) }).promise;
            totalPages = pdfJsDoc.numPages;
            currentPage = 1;
            await renderPage();
            document.getElementById('pageInfo').textContent = `${currentPage} / ${totalPages}`;
            updateStatus(`PDF загружен: ${file.name}`);
            showNotification('PDF загружен', 'success');
        } catch(e) { console.error('[EDITOR] load error:', e); showNotification('Ошибка: '+e.message,'error'); }
    }

    async function renderPage() {
        if (!pdfJsDoc) return;
        if (renderTask) { try { await renderTask.cancel(); } catch(e) {} renderTask = null; }
        try {
            const page = await pdfJsDoc.getPage(currentPage);
            const viewport = page.getViewport({ scale });
            canvas.width = viewport.width; canvas.height = viewport.height;
            const renderContext = { canvasContext: ctx, viewport };
            renderTask = page.render(renderContext);
            await renderTask.promise;
            renderTask = null;
            const content = await page.getTextContent();
            extractedItems = content.items.map(item => {
                const tx = item.transform;
                return {
                    text: item.str,
                    x: tx[4] * scale,
                    y: canvas.height - (tx[5] * scale),
                    width: item.width * scale,
                    height: (item.height || Math.abs(tx[0]) * 1.2) * scale,
                    pdfX: tx[4],
                    pdfY: tx[5],
                    fontSize: Math.abs(tx[0])
                };
            });
        } catch(e) { console.warn('[EDITOR] render error:', e); }
    }

    function changePage(delta) {
        const np = currentPage + delta;
        if (np >= 1 && np <= totalPages) { currentPage = np; renderPage(); document.getElementById('pageInfo').textContent = `${currentPage} / ${totalPages}`; }
    }

    function onMouseDown(e) {
        if (currentMode !== 'edit') return;
        const rect = canvas.getBoundingClientRect();
        const sx = canvas.width / rect.width, sy = canvas.height / rect.height;
        selectionStart = { x: (e.clientX - rect.left) * sx, y: (e.clientY - rect.top) * sy };
        isSelecting = true;
    }
    function onMouseMove(e) {
        if (!isSelecting) return;
        const rect = canvas.getBoundingClientRect();
        const sx = canvas.width / rect.width, sy = canvas.height / rect.height;
        const cx = (e.clientX - rect.left) * sx, cy = (e.clientY - rect.top) * sy;
        ctx.clearRect(0,0,canvas.width,canvas.height);
        renderPage().then(() => {
            ctx.strokeStyle = '#2d3c7a';
            ctx.lineWidth = 1.5;
            ctx.setLineDash([5,5]);
            ctx.strokeRect(Math.min(selectionStart.x,cx), Math.min(selectionStart.y,cy), Math.abs(cx-selectionStart.x), Math.abs(cy-selectionStart.y));
            ctx.setLineDash([]);
        });
    }
    function onMouseUp(e) {
        if (!isSelecting || !selectionStart) return;
        isSelecting = false;
        const rect = canvas.getBoundingClientRect();
        const sx = canvas.width / rect.width, sy = canvas.height / rect.height;
        const end = { x: (e.clientX - rect.left) * sx, y: (e.clientY - rect.top) * sy };
        const selected = findTextInArea(selectionStart, end);
        if (selected) {
            selectedTextRange = selected;
            editInput.value = selected.text;
            editInput.focus();
            updateStatus(`Выделено: "${selected.text.substring(0,40)}${selected.text.length>40?'...':''}"`);
            highlightSelection(selected);
        } else { updateStatus('Текст не найден'); }
    }
    function findTextInArea(p1, p2) {
        const minX = Math.min(p1.x,p2.x), maxX = Math.max(p1.x,p2.x);
        const minY = Math.min(p1.y,p2.y), maxY = Math.max(p1.y,p2.y);
        const items = extractedItems.filter(i => i.x < maxX+5 && i.x+i.width > minX-5 && i.y < maxY+5 && i.y+i.height > minY-5);
        if (!items.length) return null;
        items.sort((a,b) => b.y - a.y || a.x - b.x);
        return { text: items.map(i => i.text).join(' '), items, bounds: { minX, maxX, minY, maxY } };
    }
    function highlightSelection(sel) {
        ctx.save();
        ctx.strokeStyle = '#2d3c7a';
        ctx.lineWidth = 2;
        ctx.setLineDash([4,4]);
        ctx.strokeRect(sel.bounds.minX-2, sel.bounds.minY-2, sel.bounds.maxX-sel.bounds.minX+4, sel.bounds.maxY-sel.bounds.minY+4);
        ctx.restore();
    }

    async function onCanvasClick(e) {
        if (!pdfDoc) { showNotification('Загрузите PDF','warning'); return; }
        const rect = canvas.getBoundingClientRect();
        const sx = canvas.width / rect.width, sy = canvas.height / rect.height;
        const cx = (e.clientX - rect.left) * sx, cy = (e.clientY - rect.top) * sy;
        if (currentMode === 'add') await addTextAt(cx, cy);
        else if (currentMode === 'delete') await deleteTextAt(cx, cy);
        else if (currentMode === 'watermark') await addWatermark();
    }

    async function getFont() {
        const sel = document.getElementById('fontSelect').value;
        if (customFont && sel !== 'helvetica' && sel !== 'courier') return customFont;
        if (sel === 'times') return await pdfDoc.embedFont(PDFLib.StandardFonts.TimesRoman);
        if (sel === 'courier') return await pdfDoc.embedFont(PDFLib.StandardFonts.Courier);
        return await pdfDoc.embedFont(PDFLib.StandardFonts.Helvetica);
    }

    async function applyEdit() {
        if (currentMode === 'edit' && selectedTextRange) await replaceText();
        else if (currentMode === 'edit') showNotification('Выделите текст', 'warning');
        else if (currentMode === 'add') showNotification('Кликните на страницу', 'info');
    }
    async function replaceText() {
        const newText = document.getElementById('editTextInput').value.trim();
        if (!newText) { showNotification('Введите текст','warning'); return; }
        try {
            const page = pdfDoc.getPages()[currentPage-1];
            const font = await getFont();
            const size = parseInt(document.getElementById('fontSize').value);
            const color = { black:{r:0,g:0,b:0}, red:{r:1,g:0,b:0}, blue:{r:0,g:0,b:1} }[document.getElementById('fontColor').value] || {r:0,g:0,b:0};
            const items = selectedTextRange.items;
            const minX = Math.min(...items.map(i=>i.pdfX));
            const maxX = Math.max(...items.map(i=>i.pdfX + i.width/scale));
            const minY = Math.min(...items.map(i=>i.pdfY));
            const maxY = Math.max(...items.map(i=>i.pdfY + i.fontSize));
            page.drawRectangle({ x: minX-2, y: minY-2, width: maxX-minX+4, height: maxY-minY+4, color: {r:1,g:1,b:1} });
            page.drawText(newText, { x: items[0].pdfX, y: items[0].pdfY, size, font, color });
            await saveAndReload();
            showNotification('Текст заменён','success');
            selectedTextRange = null;
        } catch(e) { console.error('[EDITOR] replace error:', e); showNotification('Ошибка: '+e.message,'error'); }
    }
    async function addTextAt(x,y) {
        const text = document.getElementById('editTextInput').value.trim();
        if (!text) { showNotification('Введите текст','warning'); return; }
        try {
            const page = pdfDoc.getPages()[currentPage-1];
            const { height } = page.getSize();
            const font = await getFont();
            const size = parseInt(document.getElementById('fontSize').value);
            const color = { black:{r:0,g:0,b:0}, red:{r:1,g:0,b:0}, blue:{r:0,g:0,b:1} }[document.getElementById('fontColor').value] || {r:0,g:0,b:0};
            page.drawText(text, { x: x/scale, y: height - (y/scale) - size, size, font, color });
            await saveAndReload();
            showNotification('Текст добавлен','success');
        } catch(e) { console.error('[EDITOR] add error:', e); showNotification('Ошибка: '+e.message,'error'); }
    }
    async function deleteTextAt(x,y) {
        const item = extractedItems.find(i => x >= i.x-5 && x <= i.x+i.width+5 && y >= i.y-5 && y <= i.y+i.height+5);
        if (!item) { showNotification('Кликните по тексту','warning'); return; }
        try {
            const page = pdfDoc.getPages()[currentPage-1];
            page.drawRectangle({ x: item.pdfX-2, y: item.pdfY-2, width: item.width/scale+4, height: item.height/scale+4, color: {r:1,g:1,b:1} });
            await saveAndReload();
            showNotification(`Удалено: "${item.text}"`,'success');
        } catch(e) { console.error('[EDITOR] delete error:', e); showNotification('Ошибка: '+e.message,'error'); }
    }
    async function addWatermark() {
        const text = prompt('Водяной знак:', 'КОНФИДЕНЦИАЛЬНО');
        if (!text) return;
        try {
            const page = pdfDoc.getPages()[currentPage-1];
            const { width, height } = page.getSize();
            const font = await getFont();
            page.drawText(text, { x: width/2-120, y: height/2-20, size: 50, font, color: {r:0.6,g:0.6,b:0.6}, opacity:0.25, rotate: { angle: -30, type:'degrees' } });
            await saveAndReload();
            showNotification('Водяной знак добавлен','success');
        } catch(e) { console.error('[EDITOR] watermark error:', e); showNotification('Ошибка: '+e.message,'error'); }
    }
    async function rotatePage() {
        if (!pdfDoc) return;
        try {
            const page = pdfDoc.getPages()[currentPage-1];
            page.setRotation({ angle: (page.getRotation().angle + 90) % 360 });
            await saveAndReload();
            showNotification('Поворот 90°','success');
        } catch(e) { console.error('[EDITOR] rotate error:', e); showNotification('Ошибка: '+e.message,'error'); }
    }
    async function saveAndReload() {
        const bytes = await pdfDoc.save();
        currentPdfBytes = bytes;
        pdfDoc = await PDFLib.PDFDocument.load(bytes);
        await loadCyrillicFont();
        pdfJsDoc = await pdfjsLib.getDocument({ data: bytes.slice(0) }).promise;
        totalPages = pdfJsDoc.numPages;
        await renderPage();
        document.getElementById('pageInfo').textContent = `${currentPage} / ${totalPages}`;
    }
    async function savePdf() {
        if (!pdfDoc) { showNotification('Нет PDF','warning'); return; }
        const bytes = await pdfDoc.save();
        downloadBlob(new Blob([bytes], {type:'application/pdf'}), 'edited.pdf');
        showNotification('PDF сохранён','success');
    }
    async function extractAndShowText() {
        if (!pdfJsDoc) { showNotification('Загрузите PDF','warning'); return; }
        let all = '';
        for (let i=1; i<=pdfJsDoc.numPages; i++) {
            const page = await pdfJsDoc.getPage(i);
            const content = await page.getTextContent();
            all += content.items.map(t => t.str).join(' ') + '\n\n';
        }
        document.getElementById('extractedTextContent').textContent = all;
        document.getElementById('extractedTextPanel').style.display = 'block';
        updateStatus(`Извлечено ${pdfJsDoc.numPages} страниц`);
    }
    function updateStatus(msg) {
        const el = document.getElementById('statusArea');
        if (msg) el.innerHTML = `<i class="fas fa-info-circle"></i> ${msg}`;
        else {
            const desc = { edit:'Выделите текст → измените → Enter', add:'Введите текст → кликните на страницу', delete:'Кликните по тексту для удаления', watermark:'Кликните для добавления' };
            el.innerHTML = `<i class="fas fa-info-circle"></i> ${desc[currentMode] || 'Режим'}`;
        }
    }
    updateStatus('Загрузите PDF');
}
