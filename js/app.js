import { initConverter } from './converter.js';

console.log('App module loaded');

function initTabs() {
    console.log('Initializing tabs');
    const tabs = document.querySelectorAll('.tab-btn');
    const contents = document.querySelectorAll('.tab-content');
    
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const tabId = tab.dataset.tab;
            tabs.forEach(t => t.classList.remove('active'));
            contents.forEach(c => c.classList.remove('active'));
            tab.classList.add('active');
            const target = document.getElementById(tabId);
            if (target) target.classList.add('active');
            console.log('Tab switched to:', tabId);
        });
    });
}

document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM fully loaded');
    try {
        initTabs();
        initConverter();
        initPdfEditor();
        initMerge();
        console.log('All modules initialized successfully');
    } catch (e) {
        console.error('Initialization error:', e);
    }
});
