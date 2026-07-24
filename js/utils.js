export function escapeHtml(unsafe) {
    if (!unsafe) return '';
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

export function downloadBlob(blob, filename) {
    try {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        console.log('Download started:', filename);
    } catch (e) {
        console.error('Download error:', e);
    }
}

export function readFileAsArrayBuffer(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = (e) => reject(new Error('Failed to read file: ' + e.target.error));
        reader.readAsArrayBuffer(file);
    });
}

export function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = (e) => reject(new Error('Failed to read file: ' + e.target.error));
        reader.readAsDataURL(file);
    });
}

let notificationContainer = null;

export function showNotification(message, type = 'info', duration = 3500) {
    console.log('Notification:', type, message);
    if (!notificationContainer) {
        notificationContainer = document.createElement('div');
        notificationContainer.id = 'notification-container';
        document.body.appendChild(notificationContainer);
    }

    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    const iconMap = {
        success: 'fa-check-circle',
        error: 'fa-exclamation-circle',
        info: 'fa-info-circle',
        warning: 'fa-exclamation-triangle'
    };
    notification.innerHTML = `<i class="fas ${iconMap[type] || iconMap.info}"></i> ${message}`;
    notificationContainer.appendChild(notification);

    setTimeout(() => {
        notification.style.opacity = '0';
        setTimeout(() => notification.remove(), 300);
    }, duration);
}

export function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
}

export function getFileExtension(filename) {
    return filename.split('.').pop().toLowerCase();
}

export function getFileType(filename) {
    const ext = getFileExtension(filename);
    const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'tiff'];
    const docExts = ['doc', 'docx', 'odt', 'rtf', 'txt'];
    const excelExts = ['xls', 'xlsx', 'ods', 'csv'];
    
    if (ext === 'pdf') return 'pdf';
    if (imageExts.includes(ext)) return 'image';
    if (docExts.includes(ext) || excelExts.includes(ext)) return 'document';
    return 'unknown';
}

export function createImageFromDataUrl(dataUrl) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('Failed to load image'));
        img.src = dataUrl;
    });
}

export function dataUrlToBlob(dataUrl) {
    return fetch(dataUrl).then(res => res.blob());
}
