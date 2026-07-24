import { downloadBlob, readFileAsArrayBuffer, showNotification, escapeHtml, formatFileSize } from './utils.js';

let mergeFiles = [];

export function initMerge() {
    console.log('Merge module initializing');
    const container = document.getElementById('merge');
    if (!container) {
        console.error('Container #merge not found');
        return;
    }
    
    container.innerHTML = `
        <div class="tool-card">
            <h3><i class="fas fa-object-group"></i> Объединение PDF</h3>
            
            <div class="drop-zone" id="mergeDropZone">
                <i class="fas fa-cloud-upload-alt"></i>
                <p>Перетащите PDF файлы сюда или <strong>кликните для выбора</strong></p>
                <input type="file" id="mergeFileInput" multiple accept=".pdf" style="display:none;">
            </div>
            
            <div id="mergeFileList" class="file-list"></div>
            
            <div class="btn-group">
                <button class="btn btn-primary" id="mergeBtn">
                    <i class="fas fa-compress-alt"></i> Объединить
                </button>
                <button class="btn btn-secondary" id="clearMergeBtn">
                    <i class="fas fa-trash"></i> Очистить
                </button>
            </div>
            
            <div id="mergeStatus" class="status">
                <i class="fas fa-info-circle"></i> Добавьте PDF файлы для объединения
            </div>
        </div>
    `;

    const dropZone = document.getElementById('mergeDropZone');
    const input = document.getElementById('mergeFileInput');
    const fileList = document.getElementById('mergeFileList');
    const mergeBtn = document.getElementById('mergeBtn');
    const clearBtn = document.getElementById('clearMergeBtn');
    const statusEl = document.getElementById('mergeStatus');

    if (!dropZone || !input || !fileList || !mergeBtn || !clearBtn) {
        console.error('Merge elements not found');
        return;
    }

    console.log('Merge elements found');

    dropZone.addEventListener('click', () => input.click());
    dropZone.addEventListener('dragover', e => e.preventDefault());
    dropZone.addEventListener('drop', async e => {
        e.preventDefault();
        const files = Array.from(e.dataTransfer.files).filter(f => f.type === 'application/pdf');
        await addFiles(files);
    });

    input.addEventListener('change', async e => {
        await addFiles(Array.from(e.target.files));
        input.value = '';
    });

    async function addFiles(files) {
        console.log('Adding PDF files:', files.length);
        for (const file of files) {
            try {
                const arrayBuffer = await readFileAsArrayBuffer(file);
                mergeFiles.push({ file, name: file.name, size: file.size, arrayBuffer });
                console.log('PDF added:', file.name);
            } catch (e) {
                console.error('Error reading PDF:', file.name, e);
            }
        }
        renderFileList();
        updateStatus(`Добавлено ${files.length} PDF файлов`, 'info');
    }

    function renderFileList() {
        fileList.innerHTML = '';
        if (mergeFiles.length === 0) {
            fileList.innerHTML = `
                <div style="text-align:center; color:var(--text-muted); padding:20px;">
                    <i class="fas fa-inbox" style="font-size:2rem; display:block; margin-bottom:8px;"></i>
                    Нет добавленных PDF файлов
                </div>
            `;
            return;
        }

        mergeFiles.forEach((item, index) => {
            const div = document.createElement('div');
            div.className = 'file-item';
            div.innerHTML = `
                <span class="handle"><i class="fas fa-grip-lines"></i></span>
                <span><i class="fas fa-file-pdf" style="color:var(--accent);"></i></span>
                <span class="name">${escapeHtml(item.name)} (${formatFileSize(item.size)})</span>
                <span class="remove" data-index="${index}"><i class="fas fa-times"></i></span>
            `;
            fileList.appendChild(div);
        });

        document.querySelectorAll('.remove').forEach(btn => {
            btn.addEventListener('click', e => {
                const idx = parseInt(e.currentTarget.dataset.index);
                mergeFiles.splice(idx, 1);
                renderFileList();
                updateStatus('Файл удалён', 'info');
            });
        });
    }

    clearBtn.addEventListener('click', () => {
        mergeFiles = [];
        renderFileList();
        updateStatus('Список очищен', 'info');
        showNotification('Список очищен', 'info');
    });

    mergeBtn.addEventListener('click', async () => {
        console.log('Merge button clicked');
        if (mergeFiles.length < 2) {
            showNotification('Добавьте минимум 2 PDF файла', 'warning');
            return;
        }

        try {
            updateStatus('Объединение...', 'info');
            const { PDFDocument } = PDFLib;
            const mergedPdf = await PDFDocument.create();
            
            for (const item of mergeFiles) {
                const pdf = await PDFDocument.load(item.arrayBuffer);
                const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
                copiedPages.forEach(page => mergedPdf.addPage(page));
            }
            
            const pdfBytes = await mergedPdf.save();
            downloadBlob(new Blob([pdfBytes], { type: 'application/pdf' }), 'merged.pdf');
            updateStatus(`Объединено ${mergeFiles.length} файлов`, 'success');
            showNotification(`Объединено ${mergeFiles.length} PDF файлов`, 'success');
        } catch (err) {
            console.error('Merge error:', err);
            updateStatus('Ошибка: ' + err.message, 'error');
            showNotification('Ошибка объединения: ' + err.message, 'error');
        }
    });

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
    console.log('Merge module initialized');
}
