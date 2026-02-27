function brl(value) {
    return value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function parseBRL(str) {
    if (!str) return 0;
    if (typeof str === 'number') return str;
    return parseFloat(str.replace(/\./g, '').replace(',', '.')) || 0;
}

function formatBRL(num) {
    return num.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2});
}

function toast(msg, type='info') {
    const div = document.createElement('div');
    div.className = `toast toast-${type}`;
    div.innerHTML = `${msg} <span onclick="this.parentElement.remove()" style="float:right;cursor:pointer;font-weight:bold;">&times;</span>`;
    div.style.position = 'fixed';
    div.style.top = '20px';
    div.style.left = '50%';
    div.style.transform = 'translateX(-50%)';
    div.style.zIndex = '9999';
    div.style.background = type === 'error' ? '#fee2e2' : '#dcfce7';
    div.style.color = type === 'error' ? '#991b1b' : '#166534';
    div.style.padding = '12px 24px';
    div.style.borderRadius = '8px';
    div.style.borderLeft = type === 'error' ? '4px solid #ef4444' : '4px solid #22c55e';
    div.style.boxShadow = '0 10px 15px -3px rgba(0,0,0,0.1)';
    div.style.fontWeight = '500';
    document.body.appendChild(div);
    setTimeout(() => { if (document.body.contains(div)) div.remove(); }, 4000);
}

async function apiPost(url, data) {
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(data)
        });
        return await res.json();
    } catch (e) {
        return {status: 'error', message: e.toString()};
    }
}