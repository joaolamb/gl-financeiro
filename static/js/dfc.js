let EDIT_MODE = false;
const gruposRed = [
    'deducoes','desp_var','custos','folha','outras_pessoal','estrutura',
    'veiculos','terceiros','consumo','informatica','marketing','comunicacao',
    'outras_desp','bancarias','fin_saida','impostos','socios','capex','emp_saida'
];

document.addEventListener('DOMContentLoaded', () => {
    initMasks();
    
    const btnEdit = document.getElementById('btnToggleEdit');
    if(btnEdit) {
        btnEdit.addEventListener('click', toggleEditMode);
    }
    
    recalculateTotals();
    restoreAccordions();
});

function initMasks() {
    document.querySelectorAll('.money-mask').forEach(input => {
        // Formatação inicial
        if (input.value !== '') {
            let val = input.value;
            input.value = val;
        }

        input.addEventListener('input', (e) => {
            let value = e.target.value.replace(/\D/g, "");
            if (value === "") {
                e.target.value = "";
                recalculateTotals();
                return;
            }
            value = (parseFloat(value) / 100).toFixed(2) + "";
            value = value.replace(".", ",");
            value = value.replace(/(\d)(\d{3})(\d{3}),/g, "$1.$2.$3,");
            value = value.replace(/(\d)(\d{3}),/g, "$1.$2,");
            e.target.value = value;
            recalculateTotals();
        });
        
        input.addEventListener('focus', function() { this.select(); });
    });
}

function toggleEditMode() {
    EDIT_MODE = !EDIT_MODE;
    document.body.classList.toggle("is-edit-mode", EDIT_MODE);
    const btn = document.getElementById("btnToggleEdit");
    btn.innerHTML = EDIT_MODE 
        ? '<i class="fa-solid fa-check"></i> Concluir Edição' 
        : '<i class="fa-solid fa-pen"></i> Editar Estrutura';
}

function saveData(input) {
    const val = parseBRL(input.value);
    const data = {
        categoria_id: input.dataset.catId,
        mes: input.dataset.mes,
        ano: input.dataset.ano,
        valor: val
    };
    
    apiPost('/api/atualizar', data).then(res => {
        if(res.status !== 'ok') toast("Erro ao salvar dados!", "error");
    });
}

function recalculateTotals() {
    const subgrupos = {};
    const masters = {};

    document.querySelectorAll('.money-mask').forEach(inp => {
        let val = parseBRL(inp.value);
        let mes = parseInt(inp.dataset.mes);
        let grp = inp.dataset.group;

        if (!subgrupos[grp]) subgrupos[grp] = new Float64Array(13);
        subgrupos[grp][mes] += val;

        if (gruposRed.includes(grp) && val > 0) inp.style.color = '#d92d20';
        else inp.style.color = 'inherit';
    });

    document.querySelectorAll('.row-conta').forEach(row => {
        let totalRow = 0;
        let isRed = false;

        row.querySelectorAll('.cell-input').forEach(inp => {
            let val = parseBRL(inp.value);
            totalRow += val;
            if (inp.style.color === 'rgb(217, 45, 32)') isRed = true;
        });

        let cellTotal = row.querySelector('.cell-total-ano');
        if(cellTotal) {
            cellTotal.innerText = formatBRL(totalRow);
            cellTotal.style.color = (isRed && totalRow > 0) ? '#d92d20' : 'inherit';
        }
    });

    document.querySelectorAll('.row-master').forEach(row => {
        let id = row.id.replace('master-', '');
        if (!masters[id]) masters[id] = new Float64Array(13);
    });

    const gruposSubtraemMaster = ['deducoes', 'rec_desp', 'fin_saida', 'emp_saida'];

    // 4. Calcular Headers
    for (const grp in subgrupos) {
        let headerRow = document.getElementById(`header-${grp}`);
        if (headerRow) {
            let masterGrp = headerRow.dataset.pai;
            if (!masters[masterGrp]) masters[masterGrp] = new Float64Array(13);

            let somaHeader = 0;
            let vals = subgrupos[grp];
            let isRedGrp = gruposRed.includes(grp);

            for (let m = 1; m <= 12; m++) {
                let val = vals[m];
                let cell = headerRow.querySelector(`[data-m="${m}"]`);
                if (cell) {
                    cell.innerText = formatBRL(val);
                    cell.style.color = (isRedGrp && val > 0) ? '#d92d20' : 'inherit';
                }
                somaHeader += val;

                if (gruposSubtraemMaster.includes(grp)) {
                    masters[masterGrp][m] -= val;
                } else {
                    masters[masterGrp][m] += val;
                }
            }

            let cellTotal = headerRow.querySelector('.header-total');
            if (cellTotal) {
                cellTotal.innerText = formatBRL(somaHeader);
                cellTotal.style.color = (isRedGrp && somaHeader > 0) ? '#d92d20' : 'inherit';
            }
        }
    }

    for (const mGrp in masters) {
        let masterRow = document.getElementById(`master-${mGrp}`);
        if (masterRow) {
            let vals = masters[mGrp];
            let somaMaster = 0;

            for (let m = 1; m <= 12; m++) {
                let val = vals[m];
                let cell = masterRow.querySelector(`.master-val[data-m="${m}"]`);
                if (cell) cell.innerText = formatBRL(val);
                somaMaster += val;
            }
            let totalMasterCell = masterRow.querySelector('.master-total');
            if(totalMasterCell) totalMasterCell.innerText = formatBRL(somaMaster);
        }
    }


    const GetM = (k, m) => masters[k] ? masters[k][m] : 0;
    const sumsAnuais = {
        mcb: 0, ebitda: 0, lair: 0, lucro_liquido: 0, 
        geracao_bruta: 0, geracao_liquida: 0, saldo_final: 0
    };

    for (let m = 1; m <= 12; m++) {
        let mcb = GetM('grp_recebimentos', m) - GetM('grp_custos_var', m);
        updateTotal('mcb', m, mcb);
        sumsAnuais.mcb += mcb;

        let ebitda = mcb - GetM('grp_desp_op', m);
        updateTotal('ebitda', m, ebitda);
        sumsAnuais.ebitda += ebitda;

        let finLiq = GetM('grp_financeiro', m); 
        let lair = ebitda + finLiq;
        updateTotal('lair', m, lair);
        sumsAnuais.lair += lair;

        let lucro = lair - GetM('grp_impostos', m);
        updateTotal('lucro_liquido', m, lucro);
        sumsAnuais.lucro_liquido += lucro;

        let gBruta = lucro - GetM('grp_socios', m);
        updateTotal('geracao_bruta', m, gBruta);
        sumsAnuais.geracao_bruta += gBruta;

        let gLiq = gBruta - GetM('grp_capex', m);
        updateTotal('geracao_liquida', m, gLiq);
        sumsAnuais.geracao_liquida += gLiq;

        let empLiq = GetM('grp_emprestimos', m); 
        let final = gLiq + empLiq;
        updateTotal('saldo_final', m, final);
        sumsAnuais.saldo_final += final;
    }
    
    for (const [key, value] of Object.entries(sumsAnuais)) {
        let el = document.querySelector(`#total-${key} .total-ano`);
        if(el) {
            el.innerText = formatBRL(value);
            el.style.color = value < 0 ? '#d92d20' : 'inherit';
        }
    }
}

function updateTotal(id, mes, valor) {
    let el = document.querySelector(`#total-${id} [data-m="${mes}"]`);
    if (el) {
        el.innerText = formatBRL(valor);
        el.style.color = valor < 0 ? '#d92d20' : 'inherit';
    }
}

function showModal(title, html, onConfirm) {
    document.getElementById('modalTitle').innerText = title;
    document.getElementById('modalBody').innerHTML = html;
    document.getElementById('modalOverlay').classList.remove('hidden');
    
    const btn = document.getElementById('modalConfirmBtn');
    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);
    newBtn.onclick = onConfirm;
}

function closeModal() {
    document.getElementById('modalOverlay').classList.add('hidden');
}

function openCreateMaster() {
    showModal('Nova Categoria Master', `
        <div class="form-grid">
            <label>Título da Categoria</label>
            <input id="swal-input1" class="full-input" placeholder="Ex: Receitas Financeiras">
        </div>
    `, () => {
        const texto = document.getElementById('swal-input1').value;
        if(!texto) return toast('Digite um título', 'error');
        
        apiPost('/api/create_master', {texto}).then(res => {
            if(res.status === 'ok') location.reload();
            else toast(res.message, "error");
        });
    });
}

function openCreateHeader(masterGrupo) {
    showModal('Nova Subcategoria', `
        <div class="form-grid">
            <label>Nome da Subcategoria</label>
            <input id="swal-input1" class="full-input" placeholder="Ex: Impostos s/ Vendas">
        </div>
    `, () => {
        const texto = document.getElementById('swal-input1').value;
        if(!texto) return toast('Digite um nome', 'error');
        apiPost('/api/create_header', {master_grupo: masterGrupo, texto}).then(res => {
            if(res.status === 'ok') location.reload();
            else toast(res.message, "error");
        });
    });
}

function openInlineCreateConta(btn) {
    document.querySelectorAll('.inline-create-row').forEach(e => e.remove());

    const trHeader = btn.closest('tr');
    const headerId = trHeader.dataset.layoutId;
    
    const trNew = document.createElement('tr');
    trNew.className = 'inline-create-row';
    trNew.innerHTML = `
        <td class="td-code" style="padding: 6px;">
            <input id="new_code" class="full-input" placeholder="Cód" style="width:100%;">
        </td>
        <td class="td-name" style="padding: 6px 40px;">
            <div style="display:flex; gap:10px; align-items:center;">
                <input id="new_name" class="full-input" placeholder="Nome da Conta" style="flex:1;">
                <button class="primary-btn small" onclick="submitCreateConta(${headerId})"><i class="fa-solid fa-check"></i> Salvar</button>
                <button class="ghost-btn small" onclick="this.closest('tr').remove()"><i class="fa-solid fa-xmark"></i></button>
            </div>
        </td>
        <td colspan="13" style="background:#f1f5f9;"></td>
    `;
    
    trHeader.after(trNew);
    document.getElementById('new_code').focus();
}

function submitCreateConta(headerId) {
    const codigo = document.getElementById('new_code').value;
    const nome = document.getElementById('new_name').value;
    
    if(!codigo || !nome) return toast("Preencha código e nome", "error");
    
    apiPost('/api/create_conta', {header_layout_id: headerId, codigo, nome}).then(res => {
        if(res.status === 'ok') location.reload();
        else toast(res.message, "error");
    });
}

function openEditText(layoutId, tipo, textoAtual) {
    showModal(`Editar ${tipo === 'master' ? 'Master' : 'Subcategoria'}`, `
        <div class="form-grid">
            <label>Texto</label>
            <input id="t_texto" class="full-input" type="text" value="${textoAtual.replace(/"/g, '&quot;')}">
        </div>
    `, () => {
        const texto = document.getElementById('t_texto').value.trim();
        if(!texto) return toast('O texto não pode estar vazio.', 'error');
        apiPost('/api/update_text', { layout_id: layoutId, texto }).then(res => {
            if(res.status === 'ok') location.reload();
            else toast(res.message, "error");
        });
    });
}

function requestDeleteHeader(id) {
    if(!confirm("Excluir subcategoria?")) return;
    apiPost('/api/delete_header', {header_id: id}).then(res => {
        if(res.status === 'ok') location.reload();
        else toast(res.message, "error");
    });
}

function requestDeleteConta(id) {
    if(!confirm("Excluir conta?")) return;
    apiPost('/api/delete_conta', {layout_id: id}).then(res => {
        if(res.status === 'ok') location.reload();
        else toast(res.message, "error");
    });
}

function toggleAccordion(id) {
    const icon = document.getElementById(`icon-${id}`);
    const rows = document.querySelectorAll(`tr[data-pai="${id}"]`);
    
    let isOpening = !icon.classList.contains('open');
    icon.classList.toggle('open', isOpening);
    
    rows.forEach(r => {
        if(isOpening) {
            r.classList.remove('hidden-row');
        } else {
            r.classList.add('hidden-row');
            if(r.classList.contains('row-header')) {
                const childContas = document.querySelectorAll(`tr[data-header="${r.id.replace('header-','')}"]`);
                childContas.forEach(c => c.classList.add('hidden-row'));
            }
        }
    });
    
    let state = JSON.parse(localStorage.getItem('accordionState') || "[]");
    if(isOpening) state.push(id);
    else state = state.filter(x => x !== id);
    localStorage.setItem('accordionState', JSON.stringify(Array.from(new Set(state))));
}

function restoreAccordions() {
    let state = JSON.parse(localStorage.getItem('accordionState') || "[]");
    state.forEach(id => {
        const icon = document.getElementById(`icon-${id}`);
        if(icon) {
            icon.classList.add('open');
            document.querySelectorAll(`tr[data-pai="${id}"]`).forEach(r => {
                r.classList.remove('hidden-row');
            });
        }
    });
}