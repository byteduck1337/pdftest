export function escapeHtml(s) { if (!s) return ''; return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
export function downloadBlob(blob, name) {
    try {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = name;
        document.body.appendChild(a); a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (e) { console.error('[UTILS] download error:', e); }
}
export function readFileAsArrayBuffer(file) {
    return new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(r.result);
        r.onerror = () => rej(new Error('readAsArrayBuffer failed'));
        r.readAsArrayBuffer(file);
    });
}
export function readFileAsDataURL(file) {
    return new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(r.result);
        r.onerror = () => rej(new Error('readAsDataURL failed'));
        r.readAsDataURL(file);
    });
}
let container = null;
export function showNotification(msg, type = 'info', duration = 3000) {
    if (!container) { container = document.createElement('div'); container.id = 'notification-container'; document.body.appendChild(container); }
    const el = document.createElement('div');
    el.className = `notification notification-${type}`;
    const icons = { success:'fa-check-circle', error:'fa-exclamation-circle', info:'fa-info-circle', warning:'fa-exclamation-triangle' };
    el.innerHTML = `<i class="fas ${icons[type] || icons.info}"></i> ${msg}`;
    container.appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 200); }, duration);
}
export function formatFileSize(b) {
    if (b < 1024) return b + ' B';
    if (b < 1048576) return (b/1024).toFixed(1) + ' KB';
    return (b/1048576).toFixed(1) + ' MB';
}
export function getFileType(name) {
    const ext = name.split('.').pop().toLowerCase();
    if (ext === 'pdf') return 'pdf';
    if (['jpg','jpeg','png','gif','webp'].includes(ext)) return 'image';
    if (['doc','docx','xls','xlsx','txt','odt'].includes(ext)) return 'document';
    return 'unknown';
}
