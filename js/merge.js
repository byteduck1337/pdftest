import { downloadBlob, readFileAsArrayBuffer, showNotification, escapeHtml, formatFileSize } from './utils.js';

let mergeFiles = [];

export function initMerge() {
    const container = document.getElementById('merge');
    if (!container) { console.error('[MERGE] container not found'); return; }

    container.innerHTML = `
        <div class="tool-card">
            <h3><i class="fas fa-layer-group"></i> Объединение PDF</h3>
            <div class="drop-zone" id="mergeDropZone">
                <i class="fas fa-cloud-upload-alt"></i>
                <p>Перетащите PDF или <strong>кликните</strong></p>
                <input type="file" id="mergeInput" multiple accept=".pdf" style="display:none;">
            </div>
            <div id="mergeFileList" class="file-list"></div>
            <div class="btn-group">
                <button class="btn btn-primary" id="mergeBtn"><i class="fas fa-play"></i> Объединить</button>
                <button class="btn btn-secondary" id="clearMergeBtn"><i class="fas fa-trash"></i> Очистить</button>
            </div>
            <div id="mergeStatus" class="status"><i class="fas fa-info-circle"></i> Добавьте PDF</div>
        </div>
    `;

    const drop = document.getElementById('mergeDropZone');
    const input = document.getElementById('mergeInput');
    const list = document.getElementById('mergeFileList');
    const mergeBtn = document.getElementById('mergeBtn');
    const clearBtn = document.getElementById('clearMergeBtn');
    const status = document.getElementById('mergeStatus');

    if (!drop || !input || !list || !mergeBtn || !clearBtn) { console.error('[MERGE] missing elements'); return; }

    drop.addEventListener('click', () => input.click());
    drop.addEventListener('dragover', e => e.preventDefault());
    drop.addEventListener('drop', async e => {
        e.preventDefault();
        const files = Array.from(e.dataTransfer.files).filter(f => f.type === 'application/pdf');
        await addFiles(files);
    });
    input.addEventListener('change', async e => {
        await addFiles(Array.from(e.target.files));
        input.value = '';
    });

    async function addFiles(files) {
        for (const f of files) {
            try {
                const buf = await readFileAsArrayBuffer(f);
                mergeFiles.push({ file: f, name: f.name, size: f.size, arrayBuffer: buf });
            } catch(e) { console.error('[MERGE] read error:', f.name, e); }
        }
        renderList();
        updateStatus(`Добавлено ${files.length} PDF`, 'info');
    }

    function renderList() {
        list.innerHTML = '';
        if (!mergeFiles.length) {
            list.innerHTML = `<div style="text-align:center;color:var(--text-muted);padding:16px;"><i class="fas fa-inbox" style="display:block;font-size:1.6rem;margin-bottom:6px;"></i>Нет PDF</div>`;
            return;
        }
        mergeFiles.forEach((f, i) => {
            const div = document.createElement('div');
            div.className = 'file-item';
            div.innerHTML = `
                <i class="fas fa-file-pdf" style="color:var(--primary);"></i>
                <span class="name">${escapeHtml(f.name)}</span>
                <span class="size">${formatFileSize(f.size)}</span>
                <span class="remove" data-index="${i}"><i class="fas fa-times"></i></span>
            `;
            list.appendChild(div);
        });
        list.querySelectorAll('.remove').forEach(el => {
            el.addEventListener('click', e => {
                const idx = parseInt(e.currentTarget.dataset.index);
                mergeFiles.splice(idx, 1);
                renderList();
                updateStatus('Файл удалён', 'info');
            });
        });
    }

    clearBtn.addEventListener('click', () => { mergeFiles = []; renderList(); updateStatus('Очищено', 'info'); showNotification('Очищено','info'); });

    mergeBtn.addEventListener('click', async () => {
        if (mergeFiles.length < 2) { showNotification('Минимум 2 PDF', 'warning'); return; }
        try {
            updateStatus('Объединение...', 'info');
            const { PDFDocument } = PDFLib;
            const merged = await PDFDocument.create();
            for (const item of mergeFiles) {
                const pdf = await PDFDocument.load(item.arrayBuffer);
                const pages = await merged.copyPages(pdf, pdf.getPageIndices());
                pages.forEach(p => merged.addPage(p));
            }
            const bytes = await merged.save();
            downloadBlob(new Blob([bytes], {type:'application/pdf'}), 'merged.pdf');
            updateStatus(`Объединено ${mergeFiles.length} файлов`, 'success');
            showNotification('PDF объединён', 'success');
        } catch(e) { console.error('[MERGE] error:', e); updateStatus('Ошибка: '+e.message,'error'); showNotification('Ошибка: '+e.message,'error'); }
    });

    function updateStatus(msg, type='info') {
        const icons = { info:'fa-info-circle', success:'fa-check-circle', error:'fa-exclamation-circle', warning:'fa-exclamation-triangle' };
        status.className = `status ${type}`;
        status.innerHTML = `<i class="fas ${icons[type] || icons.info}"></i> ${msg}`;
    }
    renderList();
    updateStatus('Добавьте PDF', 'info');
}
